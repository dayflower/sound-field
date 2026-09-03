import * as Tone from "tone";
import { operatorIndex } from "./routing";
import type { OperatorSettings, SynthPatch, Waveform } from "./types";

const MAX_VOICES = 8;
const FEEDBACK_DELAY_SECONDS = 0.001;
const VOICE_START_DELAY_SECONDS = 0.01;
const DECLICK_SECONDS = 0.005;

function isTonalWaveform(
  waveform: Waveform,
): waveform is Exclude<Waveform, "white"> {
  return waveform !== "white";
}

function operatorFrequency(
  settings: OperatorSettings,
  noteFrequency: number,
): number {
  const base =
    settings.frequencyMode === "ratio"
      ? noteFrequency * settings.ratio
      : settings.fixedHz;
  return base * 2 ** (settings.detune / 1200);
}

class OperatorVoice {
  readonly oscillator: Tone.Oscillator;
  readonly oscillatorGain: Tone.Gain;
  readonly noiseGain: Tone.Gain;
  readonly envelope: Tone.AmplitudeEnvelope;
  readonly output: Tone.Gain;
  readonly feedbackDelay: Tone.Delay;
  readonly feedbackGain: Tone.Gain;

  constructor(
    settings: OperatorSettings,
    noteFrequency: number,
    noise: Tone.Noise,
  ) {
    const initialWaveform = isTonalWaveform(settings.waveform)
      ? settings.waveform
      : "sine";
    this.oscillator = new Tone.Oscillator({
      frequency: operatorFrequency(settings, noteFrequency),
      type: initialWaveform,
    });
    this.oscillatorGain = new Tone.Gain(settings.waveform === "white" ? 0 : 1);
    this.noiseGain = new Tone.Gain(settings.waveform === "white" ? 1 : 0);
    this.envelope = new Tone.AmplitudeEnvelope(settings.envelope);
    this.output = new Tone.Gain(settings.enabled ? settings.level : 0);
    this.feedbackDelay = new Tone.Delay(FEEDBACK_DELAY_SECONDS, 0.02);
    this.feedbackGain = new Tone.Gain(noteFrequency * settings.feedback);

    this.oscillator.connect(this.oscillatorGain);
    noise.connect(this.noiseGain);
    this.oscillatorGain.connect(this.envelope);
    this.noiseGain.connect(this.envelope);
    this.envelope.connect(this.output);
    this.output.connect(this.feedbackDelay);
    this.feedbackDelay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.oscillator.frequency);
  }

  start(time: Tone.Unit.Time): void {
    this.oscillator.start(time);
  }

  prepare(
    settings: OperatorSettings,
    noteFrequency: number,
    startTime: number,
  ): void {
    const oscillatorLevel = settings.waveform === "white" ? 0 : 1;
    const noiseLevel = settings.waveform === "white" ? 1 : 0;
    if (isTonalWaveform(settings.waveform))
      this.oscillator.type = settings.waveform;

    this.oscillatorGain.gain.cancelScheduledValues(startTime);
    this.oscillatorGain.gain.setValueAtTime(oscillatorLevel, startTime);
    this.noiseGain.gain.cancelScheduledValues(startTime);
    this.noiseGain.gain.setValueAtTime(noiseLevel, startTime);
    this.oscillator.frequency.cancelScheduledValues(startTime);
    this.oscillator.frequency.setValueAtTime(
      operatorFrequency(settings, noteFrequency),
      startTime,
    );
    this.output.gain.cancelScheduledValues(startTime);
    this.output.gain.setValueAtTime(
      settings.enabled ? settings.level : 0,
      startTime,
    );
    this.feedbackGain.gain.cancelScheduledValues(startTime);
    this.feedbackGain.gain.setValueAtTime(
      noteFrequency * settings.feedback,
      startTime,
    );

    this.envelope.attack = settings.envelope.attack;
    this.envelope.decay = settings.envelope.decay;
    this.envelope.sustain = settings.envelope.sustain;
    this.envelope.cancel(startTime);
    const release = settings.envelope.release;
    this.envelope.release = 0;
    this.envelope.triggerRelease(startTime);
    this.envelope.release = release;
    this.envelope.triggerAttack(startTime);
  }

  update(settings: OperatorSettings, noteFrequency: number): void {
    if (isTonalWaveform(settings.waveform)) {
      this.oscillator.type = settings.waveform;
      this.oscillatorGain.gain.rampTo(1, 0.015);
      this.noiseGain.gain.rampTo(0, 0.015);
    } else {
      this.oscillatorGain.gain.rampTo(0, 0.015);
      this.noiseGain.gain.rampTo(1, 0.015);
    }
    this.oscillator.frequency.rampTo(
      operatorFrequency(settings, noteFrequency),
      0.02,
    );
    this.output.gain.rampTo(settings.enabled ? settings.level : 0, 0.02);
    this.feedbackGain.gain.rampTo(noteFrequency * settings.feedback, 0.02);
    this.envelope.attack = settings.envelope.attack;
    this.envelope.decay = settings.envelope.decay;
    this.envelope.sustain = settings.envelope.sustain;
    this.envelope.release = settings.envelope.release;
  }

  triggerAttack(time?: Tone.Unit.Time): void {
    this.envelope.triggerAttack(time);
  }

  triggerRelease(time?: Tone.Unit.Time): void {
    this.envelope.triggerRelease(time);
  }

  dispose(): void {
    this.oscillator.dispose();
    this.oscillatorGain.dispose();
    this.noiseGain.dispose();
    this.envelope.dispose();
    this.output.dispose();
    this.feedbackDelay.dispose();
    this.feedbackGain.dispose();
  }
}

type VoiceState = "idle" | "held" | "released";

interface RoutingGain {
  gain: Tone.Gain;
  sourceIndex: number;
}

function routingKey(patch: SynthPatch): string {
  return patch.routing.connections
    .map(({ from, to }) => `${from}:${to}`)
    .join("|");
}

class SynthVoice {
  readonly operators: [
    OperatorVoice,
    OperatorVoice,
    OperatorVoice,
    OperatorVoice,
  ];
  assignedAt = 0;
  state: VoiceState = "idle";
  private routingGains: RoutingGain[] = [];
  private carrierGains: Tone.Gain[] = [];
  private readonly voiceGain: Tone.Gain;
  private noteValue: string | null = null;
  private noteFrequencyValue = 440;
  private currentRoutingKey = "";
  private disposed = false;
  private cleanupTimer: number | undefined;

  constructor(
    patch: SynthPatch,
    destination: Tone.InputNode,
    noise: Tone.Noise,
    private readonly onIdle: (voice: SynthVoice) => void,
  ) {
    this.voiceGain = new Tone.Gain(0).connect(destination);
    this.operators = patch.operators.map(
      (settings) => new OperatorVoice(settings, this.noteFrequencyValue, noise),
    ) as [OperatorVoice, OperatorVoice, OperatorVoice, OperatorVoice];
    this.rebuildRouting(patch);
  }

  get note(): string | null {
    return this.noteValue;
  }

  start(time: Tone.Unit.Time): void {
    for (const operator of this.operators) operator.start(time);
  }

  activate(note: string, noteFrequency: number, patch: SynthPatch): void {
    if (this.disposed) return;
    const now = Tone.now();
    const startTime = now + VOICE_START_DELAY_SECONDS;
    window.clearTimeout(this.cleanupTimer);

    this.voiceGain.gain.cancelAndHoldAtTime(now);
    this.voiceGain.gain.linearRampToValueAtTime(0, now + DECLICK_SECONDS);
    this.voiceGain.gain.setValueAtTime(0, startTime);
    this.voiceGain.gain.linearRampToValueAtTime(1, startTime + DECLICK_SECONDS);

    this.noteValue = note;
    this.noteFrequencyValue = noteFrequency;
    this.assignedAt = performance.now();
    this.state = "held";
    patch.operators.forEach((settings, index) => {
      this.operators[index]?.prepare(settings, noteFrequency, startTime);
    });
    this.setRoutingGainValues(patch, startTime);
  }

  update(patch: SynthPatch): void {
    patch.operators.forEach((settings, index) => {
      this.operators[index]?.update(settings, this.noteFrequencyValue);
    });
    if (this.currentRoutingKey !== routingKey(patch))
      this.rebuildRouting(patch);
    this.setRoutingGainValues(patch);
  }

  release(patch: SynthPatch): void {
    if (this.disposed || this.state !== "held") return;
    this.state = "released";
    for (const operator of this.operators) operator.triggerRelease();
    const longestRelease = Math.max(
      ...patch.operators.map(({ envelope }) => envelope.release),
    );
    window.clearTimeout(this.cleanupTimer);
    this.cleanupTimer = window.setTimeout(
      () => this.markIdle(),
      (longestRelease + 0.15) * 1000,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.cleanupTimer);
    this.disposeRouting();
    for (const operator of this.operators) operator.dispose();
    this.voiceGain.dispose();
  }

  private markIdle(): void {
    if (this.disposed || this.state === "idle") return;
    const now = Tone.now();
    this.voiceGain.gain.cancelAndHoldAtTime(now);
    this.voiceGain.gain.linearRampToValueAtTime(0, now + DECLICK_SECONDS);
    this.state = "idle";
    this.noteValue = null;
    this.onIdle(this);
  }

  private rebuildRouting(patch: SynthPatch): void {
    this.disposeRouting();
    for (const connection of patch.routing.connections) {
      if (connection.to === "output") continue;
      const sourceIndex = operatorIndex(connection.from);
      const targetIndex = operatorIndex(connection.to);
      const source = this.operators[sourceIndex];
      const target = this.operators[targetIndex];
      const settings = patch.operators[sourceIndex];
      if (!source || !target || !settings) continue;
      const modulationGain = new Tone.Gain(
        this.noteFrequencyValue * settings.modulationIndex,
      );
      source.output.connect(modulationGain);
      modulationGain.connect(target.oscillator.frequency);
      this.routingGains.push({ gain: modulationGain, sourceIndex });
    }

    const outputConnections = patch.routing.connections.filter(
      ({ to }) => to === "output",
    );
    const carrierScale =
      outputConnections.length > 0
        ? 1 / Math.sqrt(outputConnections.length)
        : 0;
    for (const connection of outputConnections) {
      const outputIndex = operatorIndex(connection.from);
      const operator = this.operators[outputIndex];
      if (!operator) continue;
      const carrierGain = new Tone.Gain(carrierScale);
      operator.output.connect(carrierGain);
      carrierGain.connect(this.voiceGain);
      this.carrierGains.push(carrierGain);
    }
    this.currentRoutingKey = routingKey(patch);
  }

  private setRoutingGainValues(patch: SynthPatch, time?: number): void {
    for (const { gain, sourceIndex } of this.routingGains) {
      const settings = patch.operators[sourceIndex];
      if (!settings) continue;
      const value = this.noteFrequencyValue * settings.modulationIndex;
      if (time === undefined) gain.gain.rampTo(value, 0.02);
      else {
        gain.gain.cancelScheduledValues(time);
        gain.gain.setValueAtTime(value, time);
      }
    }
  }

  private disposeRouting(): void {
    for (const { gain } of this.routingGains) gain.dispose();
    for (const gain of this.carrierGains) gain.dispose();
    this.routingGains = [];
    this.carrierGains = [];
  }
}

export class ModulateSynth {
  readonly waveform = new Tone.Waveform(512);
  readonly fft = new Tone.FFT({
    size: 1024,
    normalRange: false,
    smoothing: 0.78,
  });
  private readonly master = new Tone.Gain();
  private readonly limiter = new Tone.Limiter(-1);
  private readonly noise: Tone.Noise;
  private readonly voices: SynthVoice[];
  private readonly heldVoices = new Map<string, SynthVoice>();
  private patch: SynthPatch;
  private startPromise: Promise<void> | undefined;

  constructor(patch: SynthPatch) {
    this.patch = patch;
    this.master.gain.value = patch.masterGain;
    this.master.connect(this.limiter);
    this.limiter.toDestination();
    this.limiter.connect(this.waveform);
    this.limiter.connect(this.fft);
    this.noise = new Tone.Noise("white");
    this.voices = Array.from(
      { length: MAX_VOICES },
      () =>
        new SynthVoice(patch, this.master, this.noise, (idleVoice) => {
          this.removeHeldVoice(idleVoice);
        }),
    );
  }

  start(): Promise<void> {
    this.startPromise ??= this.startSources();
    return this.startPromise;
  }

  noteOn(note: string): void {
    const repeatedVoice = this.heldVoices.get(note);
    const voice = repeatedVoice ?? this.nextVoice();
    this.removeHeldVoice(voice);
    const noteFrequency = Tone.Frequency(note).toFrequency();
    voice.activate(note, noteFrequency, this.patch);
    this.heldVoices.set(note, voice);
  }

  noteOff(note: string): void {
    const voice = this.heldVoices.get(note);
    if (!voice) return;
    this.heldVoices.delete(note);
    voice.release(this.patch);
  }

  update(patch: SynthPatch): void {
    this.patch = patch;
    this.master.gain.rampTo(patch.masterGain, 0.025);
    for (const voice of this.voices.values()) voice.update(patch);
  }

  get activeVoiceCount(): number {
    return this.voices.filter(({ state }) => state !== "idle").length;
  }

  dispose(): void {
    for (const voice of this.voices) voice.dispose();
    this.heldVoices.clear();
    this.noise.dispose();
    this.master.dispose();
    this.limiter.dispose();
    this.waveform.dispose();
    this.fft.dispose();
  }

  private nextVoice(): SynthVoice {
    const idleVoice = this.voices.find(({ state }) => state === "idle");
    if (idleVoice) return idleVoice;
    const releasedVoices = this.voices.filter(
      ({ state }) => state === "released",
    );
    const candidates = releasedVoices.length > 0 ? releasedVoices : this.voices;
    const oldest = [...candidates].sort(
      (a, b) => a.assignedAt - b.assignedAt,
    )[0];
    if (!oldest) throw new Error("Voice pool is empty");
    return oldest;
  }

  private removeHeldVoice(voice: SynthVoice): void {
    for (const [note, heldVoice] of this.heldVoices) {
      if (heldVoice === voice) this.heldVoices.delete(note);
    }
  }

  private async startSources(): Promise<void> {
    await Tone.start();
    const startTime = Tone.now() + VOICE_START_DELAY_SECONDS;
    this.noise.start(startTime);
    for (const voice of this.voices) voice.start(startTime);
  }
}
