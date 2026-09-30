/// <reference path="./worklet-globals.d.ts" />
import {
  clonePatch,
  type EnvelopeParams,
  type EnvSnapshot,
  EnvStage,
  FEEDBACK_DEPTH_CYCLES,
  type FromWorklet,
  keyRateFactor,
  keyScaledLevel,
  type LfoWaveform,
  MOD_DEPTH_CYCLES,
  noteToFreq,
  OPERATOR_COUNT,
  type OperatorParams,
  operatorIndex,
  type Patch,
  PRESETS,
  pulse,
  routingOrder,
  type ToWorklet,
  type Waveform,
} from "../core/patch";

const MAX_VOICES = 8;
const MIN_SEGMENT_TIME = 0.0005;
const OUTPUT_GAIN = 0.3;
const ENV_REPORT_INTERVAL = 1 / 30; // seconds

const TWO_PI = Math.PI * 2;

const frac = (x: number): number => x - Math.floor(x);

/** Evaluates a waveform at phase p in [0, 1) with square pulse width pw. Output is in [-1, 1]. */
function waveAt(wave: Waveform, p: number, pw: number): number {
  switch (wave) {
    case "sine":
      return Math.sin(TWO_PI * p);
    case "triangle":
      return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
    case "sawtooth":
      return p < 0.5 ? 2 * p : 2 * p - 2;
    case "square":
      return pulse(p, pw);
    case "noise":
      return Math.random() * 2 - 1;
  }
}

/** Global LFO shared by all voices (as on the DX7). Output is bipolar in [-1, 1]. */
class Lfo {
  private phase = 0;
  private held = 0;

  reset(): void {
    this.phase = 0;
    this.held = Math.random() * 2 - 1;
  }

  /**
   * Returns the value at the current phase and advances by inc cycles. The square wave is
   * returned as a raw +-1 pulse (not mean-corrected) so that AM stays within [0, 1].
   */
  next(wave: LfoWaveform, pw: number, inc: number): number {
    const p = this.phase;
    let v: number;
    switch (wave) {
      case "triangle":
        v = waveAt("triangle", p, pw);
        break;
      case "sawDown":
        v = 1 - 2 * p;
        break;
      case "sawUp":
        v = 2 * p - 1;
        break;
      case "square":
        v = p < pw ? 1 : -1;
        break;
      case "sine":
        v = Math.sin(TWO_PI * p);
        break;
      case "sampleHold":
        v = this.held;
        break;
    }
    this.phase += inc;
    if (this.phase >= 1) {
      this.phase = frac(this.phase);
      this.held = Math.random() * 2 - 1;
    }
    return v;
  }
}

class Envelope {
  stage: EnvStage = EnvStage.Idle;
  time = 0;
  level = 0;
  private from = 0;

  noteOn(): void {
    // Start the attack from the current level to avoid clicks on retrigger.
    this.from = this.level;
    this.stage = EnvStage.Attack;
    this.time = 0;
  }

  noteOff(): void {
    if (this.stage === EnvStage.Idle || this.stage === EnvStage.Release) return;
    this.from = this.level;
    this.stage = EnvStage.Release;
    this.time = 0;
  }

  stop(): void {
    this.stage = EnvStage.Idle;
    this.time = 0;
    this.level = 0;
    this.from = 0;
  }

  /** Returns the level at the current time and advances by dt seconds. */
  next(p: EnvelopeParams, dt: number): number {
    const t = this.time;
    switch (this.stage) {
      case EnvStage.Idle:
        this.level = 0;
        return 0;
      case EnvStage.Attack: {
        const d = Math.max(p.attack, MIN_SEGMENT_TIME);
        this.level = this.from + (1 - this.from) * Math.min(t / d, 1);
        if (t >= d) this.advance(EnvStage.Seg1, d);
        break;
      }
      case EnvStage.Seg1: {
        const d = Math.max(p.d1, MIN_SEGMENT_TIME);
        this.level = 1 + (p.l1 - 1) * Math.min(t / d, 1);
        if (t >= d) this.advance(EnvStage.Seg2, d);
        break;
      }
      case EnvStage.Seg2: {
        const d = Math.max(p.d2, MIN_SEGMENT_TIME);
        this.level = p.l1 + (p.l2 - p.l1) * Math.min(t / d, 1);
        if (t >= d) this.advance(EnvStage.Sustain, d);
        break;
      }
      case EnvStage.Sustain:
        this.level = p.l2;
        break;
      case EnvStage.Release: {
        const d = Math.max(p.release, MIN_SEGMENT_TIME);
        this.level = this.from * Math.max(1 - t / d, 0);
        if (t >= d) {
          this.stage = EnvStage.Idle;
          this.level = 0;
          this.time = 0;
          return 0;
        }
        break;
      }
    }
    this.time += dt;
    return this.level;
  }

  private advance(stage: EnvStage, elapsed: number): void {
    this.stage = stage;
    this.time -= elapsed;
  }

  snapshot(): EnvSnapshot {
    return { stage: this.stage, time: this.time, level: this.level };
  }
}

class Voice {
  note = -1;
  velocity = 0;
  /** Monotonic counter used to find the oldest voice for stealing. */
  startedAt = 0;
  readonly phase = new Float64Array(OPERATOR_COUNT);
  /** Last two outputs of each operator, for self feedback. */
  readonly fb1 = new Float64Array(OPERATOR_COUNT);
  readonly fb2 = new Float64Array(OPERATOR_COUNT);
  /** Current output of each operator (before its level), read by the operators it modulates. */
  readonly out = new Float64Array(OPERATOR_COUNT);
  /** Seconds since note on, used for the LFO delay and fade-in. */
  lfoTime = 0;
  readonly envs: Envelope[] = Array.from(
    { length: OPERATOR_COUNT },
    () => new Envelope(),
  );
  /** Envelopes that keep the voice alive (the carriers' envelopes, or all of them without carriers). */
  gate: readonly number[] = [];

  get active(): boolean {
    return this.gate.some((i) => this.envs[i]!.stage !== EnvStage.Idle);
  }

  get releasing(): boolean {
    return this.gate.every((i) => {
      const stage = this.envs[i]!.stage;
      return stage === EnvStage.Release || stage === EnvStage.Idle;
    });
  }

  /** Loudest gate envelope level, used to pick the quietest releasing voice to steal. */
  get level(): number {
    return Math.max(0, ...this.gate.map((i) => this.envs[i]!.level));
  }

  noteOn(note: number, velocity: number, startedAt: number): void {
    if (!this.active) {
      this.phase.fill(0);
      this.fb1.fill(0);
      this.fb2.fill(0);
      this.out.fill(0);
    }
    this.note = note;
    this.velocity = velocity;
    this.startedAt = startedAt;
    this.lfoTime = 0;
    for (const e of this.envs) e.noteOn();
  }

  noteOff(): void {
    for (const e of this.envs) e.noteOff();
  }

  stop(): void {
    for (const e of this.envs) e.stop();
    this.fb1.fill(0);
    this.fb2.fill(0);
    this.out.fill(0);
  }
}

const operatorFreq = (op: OperatorParams, noteFreq: number): number =>
  (op.freqMode === "ratio" ? noteFreq * op.ratio : op.fixed) *
  2 ** (op.detune / 1200);

/** Values derived from the routing, recomputed whenever the patch changes. */
interface RoutingPlan {
  /** Operator indices in evaluation order (modulators first). */
  order: number[];
  /** For each operator, the enabled operators modulating it. */
  sources: number[][];
  /** Enabled operators connected to the output. */
  carriers: number[];
  /** Output normalization by the number of carriers (1/sqrt(n)). */
  carrierScale: number;
  /** Envelopes that decide whether a voice is still sounding. */
  gate: number[];
}

function planRouting(patch: Patch): RoutingPlan {
  const ops = patch.operators;
  const order = routingOrder(patch.routing) ?? [0, 1, 2, 3];
  const sources: number[][] = ops.map(() => []);
  const carriers: number[] = [];
  for (const { from, to } of patch.routing.connections) {
    const src = operatorIndex(from);
    if (!ops[src]!.enabled) continue;
    if (to === "output") carriers.push(src);
    else sources[operatorIndex(to)]!.push(src);
  }
  return {
    order,
    sources,
    carriers,
    carrierScale: carriers.length > 0 ? 1 / Math.sqrt(carriers.length) : 0,
    gate: carriers.length > 0 ? carriers : order,
  };
}

class FmProcessor extends AudioWorkletProcessor {
  private patch: Patch = clonePatch(PRESETS["Init"]!);
  private plan: RoutingPlan = planRouting(this.patch);
  private readonly voices: Voice[] = Array.from(
    { length: MAX_VOICES },
    () => new Voice(),
  );
  private noteCounter = 0;
  private lastVoice: Voice | null = null;
  private reportCountdown = 0;
  private readonly lfo = new Lfo();
  /** LFO output for the current render quantum (shared by all voices). */
  private lfoBuf = new Float32Array(128);
  // Per-quantum scratch values, indexed by operator.
  private readonly inc = new Float64Array(OPERATOR_COUNT);
  private readonly fbDepth = new Float64Array(OPERATOR_COUNT);
  private readonly outScale = new Float64Array(OPERATOR_COUNT);
  private readonly am = new Float64Array(OPERATOR_COUNT);
  // Per-voice scratch values (they depend on the note through key scaling), indexed by operator.
  private readonly modDepth = new Float64Array(OPERATOR_COUNT);
  private readonly outGain = new Float64Array(OPERATOR_COUNT);
  private readonly envDt = new Float64Array(OPERATOR_COUNT);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<ToWorklet>) =>
      this.handleMessage(e.data);
    this.applyGate();
  }

  private handleMessage(msg: ToWorklet): void {
    switch (msg.type) {
      case "patch":
        this.patch = msg.patch;
        this.plan = planRouting(msg.patch);
        this.applyGate();
        break;
      case "noteOn": {
        if (this.patch.lfo.keySync) this.lfo.reset();
        const voice = this.allocateVoice(msg.note);
        voice.noteOn(msg.note, msg.velocity, ++this.noteCounter);
        this.lastVoice = voice;
        break;
      }
      case "noteOff":
        for (const v of this.voices) {
          if (v.note === msg.note && v.active && !v.releasing) v.noteOff();
        }
        break;
      case "allNotesOff":
        for (const v of this.voices) v.stop();
        break;
    }
  }

  private applyGate(): void {
    for (const v of this.voices) v.gate = this.plan.gate;
  }

  private allocateVoice(note: number): Voice {
    // 1. Retrigger a voice already playing the same note.
    const same = this.voices.find((v) => v.active && v.note === note);
    if (same) return same;
    // 2. A free voice.
    const idle = this.voices.find((v) => !v.active);
    if (idle) return idle;
    // 3. The quietest releasing voice, otherwise the oldest voice.
    const releasing = this.voices.filter((v) => v.releasing);
    if (releasing.length > 0) {
      return releasing.reduce((a, b) => (a.level <= b.level ? a : b));
    }
    return this.voices.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]?.[0];
    if (!out) return true;
    out.fill(0);

    const { operators: ops, lfo } = this.patch;
    const { order, sources, carriers, carrierScale } = this.plan;
    const dt = 1 / sampleRate;
    const { modDepth, fbDepth, outScale, outGain, envDt, am } = this;
    for (let k = 0; k < OPERATOR_COUNT; k++) {
      fbDepth[k] = ops[k]!.feedback * FEEDBACK_DEPTH_CYCLES;
      outScale[k] = 0;
    }
    for (const k of carriers) outScale[k] = OUTPUT_GAIN * carrierScale;

    // The LFO runs even when silent so that its phase is continuous (unless key sync resets it).
    if (this.lfoBuf.length !== out.length)
      this.lfoBuf = new Float32Array(out.length);
    const lfoBuf = this.lfoBuf;
    const lfoInc = lfo.rate * dt;
    for (let i = 0; i < out.length; i++)
      lfoBuf[i] = this.lfo.next(lfo.wave, lfo.pw, lfoInc);

    // Pitch: 2^(cents * x / 1200) = exp(x * pitchK). AM lowers the gain by up to ampDepth * ams.
    // For pitch the square LFO is mean-corrected like pulse() so that it does not shift the center pitch.
    const pitchK = (lfo.pitchDepth * Math.LN2) / 1200;
    const lfoMean = lfo.wave === "square" ? 2 * lfo.pw - 1 : 0;
    const lfoScale = 1 / (1 + Math.abs(lfoMean));
    const usePitch = lfo.enabled && pitchK !== 0;
    const useAmp =
      lfo.enabled && lfo.ampDepth > 0 && ops.some((op) => op.ams > 0);
    const { delay, fade: fadeTime } = lfo;
    am.fill(1);

    for (const v of this.voices) {
      if (!v.active) continue;
      const noteFreq = noteToFreq(v.note);
      for (let k = 0; k < OPERATOR_COUNT; k++) {
        const op = ops[k]!;
        this.inc[k] = operatorFreq(op, noteFreq) * dt;
        const level = keyScaledLevel(op, v.note);
        modDepth[k] = level * MOD_DEPTH_CYCLES;
        outGain[k] = level * outScale[k]!;
        // Rate scaling runs the envelope clock faster, so its times shrink while the live
        // snapshot still matches the (unscaled) envelope drawn in the UI.
        envDt[k] = dt * keyRateFactor(op.keyScale, v.note);
      }
      const velocity = v.velocity;
      const lfoStart = v.lfoTime;
      v.lfoTime += out.length * dt;

      for (let i = 0; i < out.length; i++) {
        let pitch = 1;
        if (usePitch || useAmp) {
          const t = lfoStart + i * dt - delay;
          const fade = t < 0 ? 0 : fadeTime > 0 ? Math.min(t / fadeTime, 1) : 1;
          const x = lfoBuf[i]!;
          if (usePitch)
            pitch = Math.exp((x - lfoMean) * lfoScale * fade * pitchK);
          if (useAmp) {
            const a = lfo.ampDepth * fade * 0.5 * (x + 1);
            for (let k = 0; k < OPERATOR_COUNT; k++)
              am[k] = 1 - a * ops[k]!.ams;
          }
        }

        let sample = 0;
        for (const k of order) {
          const op = ops[k]!;
          const env = v.envs[k]!.next(op.env, envDt[k]!);
          let o = 0;
          if (op.enabled) {
            // Phase modulation by the modulators plus self feedback (average of the last
            // two outputs, as in OPM/OPN).
            let pm = fbDepth[k]! * 0.5 * (v.fb1[k]! + v.fb2[k]!);
            for (const src of sources[k]!) pm += v.out[src]! * modDepth[src]!;
            o = waveAt(op.wave, frac(v.phase[k]! + pm), op.pw) * env * am[k]!;
          }
          v.fb2[k] = v.fb1[k]!;
          v.fb1[k] = o;
          v.out[k] = o;
          v.phase[k] = frac(v.phase[k]! + this.inc[k]! * pitch);
          sample += o * outGain[k]!;
        }

        out[i]! += sample * velocity;
        if (!v.active) break;
      }
    }

    this.reportEnvelope(out.length * dt);
    return true;
  }

  private reportEnvelope(elapsed: number): void {
    this.reportCountdown -= elapsed;
    if (this.reportCountdown > 0) return;
    this.reportCountdown = ENV_REPORT_INTERVAL;
    const v = this.lastVoice;
    const idle: EnvSnapshot = { stage: EnvStage.Idle, time: 0, level: 0 };
    const msg: FromWorklet = {
      type: "env",
      ops: Array.from({ length: OPERATOR_COUNT }, (_, k) =>
        v?.active ? v.envs[k]!.snapshot() : idle,
      ),
      activeVoices: this.voices.filter((voice) => voice.active).length,
    };
    this.port.postMessage(msg);
  }
}

registerProcessor("fm-processor", FmProcessor);
