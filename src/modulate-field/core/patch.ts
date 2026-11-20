// Patch model shared between the UI thread and the AudioWorklet.

export const WAVEFORMS = [
  "sine",
  "triangle",
  "sawtooth",
  "square",
  "noise",
] as const;
export type Waveform = (typeof WAVEFORMS)[number];

export type FreqMode = "ratio" | "fixed";

export const LFO_WAVEFORMS = [
  "triangle",
  "sawDown",
  "sawUp",
  "square",
  "sine",
  "sampleHold",
] as const;
export type LfoWaveform = (typeof LFO_WAVEFORMS)[number];

/**
 * DX7-style LFO: a single LFO shared by all voices, hard-wired to pitch (all operators)
 * and amplitude (scaled per operator by its AM sensitivity).
 */
export interface LfoParams {
  /** Master switch: when off, the LFO has no effect regardless of the depths. */
  enabled: boolean;
  wave: LfoWaveform;
  /** Pulse width (duty cycle) of the square wave in (0, 1). */
  pw: number;
  /** Rate in Hz. */
  rate: number;
  /** Per-voice time in seconds after note on before the LFO starts to fade in. */
  delay: number;
  /** Per-voice fade-in time in seconds (from 0 to full depth) after the delay. */
  fade: number;
  /** Restart the LFO phase on every note on. */
  keySync: boolean;
  /** Pitch modulation depth in cents (peak). */
  pitchDepth: number;
  /** Amplitude modulation depth in [0, 1] (before per-operator sensitivity). */
  ampDepth: number;
}

/**
 * Segment envelope:
 *   note on  -> Attack (0 -> 1) -> Seg1 (1 -> l1) -> Seg2 (l1 -> l2) -> hold l2
 *   note off -> Release (current -> 0)
 * All times are in seconds, levels are linear amplitude in [0, 1].
 */
export interface EnvelopeParams {
  attack: number;
  d1: number;
  l1: number;
  d2: number;
  l2: number;
  release: number;
}

export const KEY_SCALE_CURVES = ["lin", "exp"] as const;
export type KeyScaleCurve = (typeof KEY_SCALE_CURVES)[number];

/** Reference note of key rate scaling: envelope times are unchanged at this note. */
export const KEY_RATE_CENTER = 60;

/**
 * DX7-style keyboard scaling. Level scaling changes the operator level by the distance from
 * the break point (separately on each side); rate scaling speeds up the envelope on higher notes.
 */
export interface KeyScaleParams {
  /** MIDI note where level scaling is 0 dB. */
  breakPoint: number;
  /** Level change in dB per octave below the break point (negative = quieter). */
  leftDepth: number;
  leftCurve: KeyScaleCurve;
  /** Level change in dB per octave above the break point (negative = quieter). */
  rightDepth: number;
  rightCurve: KeyScaleCurve;
  /** Rate scaling in [0, 1]: at 1, envelope times halve per octave above KEY_RATE_CENTER (and double below). */
  rate: number;
}

export interface OperatorParams {
  /** Disabled operators output silence (they neither modulate nor sound). */
  enabled: boolean;
  wave: Waveform;
  /** Pulse width (duty cycle) of the square wave in (0, 1). */
  pw: number;
  freqMode: FreqMode;
  /** Frequency multiplier relative to the note frequency (ratio mode). */
  ratio: number;
  /** Absolute frequency in Hz (fixed mode). */
  fixed: number;
  /** Detune in cents. */
  detune: number;
  /** Output level: modulation depth towards modulated operators and gain towards the output. */
  level: number;
  /** Self feedback amount. */
  feedback: number;
  /** Amplitude modulation sensitivity to the LFO in [0, 1]. */
  ams: number;
  env: EnvelopeParams;
  keyScale: KeyScaleParams;
}

export const OPERATOR_COUNT = 4;
export const OPERATOR_IDS = ["op1", "op2", "op3", "op4"] as const;
export type OperatorId = (typeof OPERATOR_IDS)[number];
export type RoutingTarget = OperatorId | "output";

/** One edge of the routing graph: `from` phase-modulates `to`, or sounds when `to` is "output". */
export interface RoutingConnection {
  from: OperatorId;
  to: RoutingTarget;
}

/** Operator routing; the modulation graph must be acyclic (feedback is per operator). */
export interface Routing {
  connections: RoutingConnection[];
}

export type Operators = [
  OperatorParams,
  OperatorParams,
  OperatorParams,
  OperatorParams,
];

/** 4-operator patch with free routing. */
export interface Patch {
  operators: Operators;
  routing: Routing;
  lfo: LfoParams;
}

// Messages: UI -> worklet
export type ToWorklet =
  | { type: "patch"; patch: Patch }
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "allNotesOff" };

export const EnvStage = {
  Idle: 0,
  Attack: 1,
  Seg1: 2,
  Seg2: 3,
  Sustain: 4,
  Release: 5,
} as const;
export type EnvStage = (typeof EnvStage)[keyof typeof EnvStage];

export interface EnvSnapshot {
  stage: EnvStage;
  /** Seconds elapsed in the current stage. */
  time: number;
  level: number;
}

// Messages: worklet -> UI
export type FromWorklet = {
  type: "env";
  ops: EnvSnapshot[];
  activeVoices: number;
};

/** Modulation depth (in cycles of phase) at modulator level 1.0 (= 4*pi rad). */
export const MOD_DEPTH_CYCLES = 2;
/** Feedback depth (in cycles of phase) at feedback 1.0. */
export const FEEDBACK_DEPTH_CYCLES = 0.75;

/** Pulse width range; the extremes would make the square wave silent. */
export const PW_MIN = 0.01;
export const PW_MAX = 0.99;

/**
 * Pulse wave with duty cycle pw, with its mean (2 * pw - 1) removed and scaled so that
 * the larger peak is 1. At pw = 0.5 this is the plain +-1 square wave.
 */
export function pulse(p: number, pw: number): number {
  const mean = 2 * pw - 1;
  return ((p < pw ? 1 : -1) - mean) / (1 + Math.abs(mean));
}

/** Level scaling in dB for a note (before the level is clamped). */
export function keyScaleDb(ks: KeyScaleParams, note: number): number {
  const octaves = (note - ks.breakPoint) / 12;
  if (octaves === 0) return 0;
  const [depth, curve] =
    octaves < 0 ? [ks.leftDepth, ks.leftCurve] : [ks.rightDepth, ks.rightCurve];
  const d = Math.abs(octaves);
  // The exponential curve equals the linear one at one octave, and is gentler nearer / steeper farther.
  return depth * (curve === "exp" ? 2 ** d - 1 : d);
}

/** Operator level after level scaling; boosts do not go beyond 1 (or the level itself, if higher). */
export function keyScaledLevel(op: OperatorParams, note: number): number {
  const scaled = op.level * 10 ** (keyScaleDb(op.keyScale, note) / 20);
  return Math.min(scaled, Math.max(op.level, 1));
}

/** Speed factor of the envelope for a note (envelope times are divided by it). */
export const keyRateFactor = (ks: KeyScaleParams, note: number): number =>
  2 ** ((ks.rate * (note - KEY_RATE_CENTER)) / 12);

/** Oscillator part of an operator (everything except the envelope and key scaling). */
export type OscillatorParams = Omit<OperatorParams, "env" | "keyScale">;

const DEFAULT_ENVELOPE: EnvelopeParams = {
  attack: 0.005,
  d1: 0.3,
  l1: 0.7,
  d2: 1.0,
  l2: 0.5,
  release: 0.3,
};

const DEFAULT_KEY_SCALE: KeyScaleParams = {
  breakPoint: 60,
  leftDepth: 0,
  leftCurve: "lin",
  rightDepth: 0,
  rightCurve: "lin",
  rate: 0,
};

const DEFAULT_OSCILLATOR: OscillatorParams = {
  enabled: true,
  wave: "sine",
  pw: 0.5,
  freqMode: "ratio",
  ratio: 1,
  fixed: 440,
  detune: 0,
  level: 0.5,
  feedback: 0,
  ams: 0,
};

const DEFAULT_LFO: LfoParams = {
  enabled: true,
  wave: "triangle",
  pw: 0.5,
  rate: 5,
  delay: 0,
  fade: 0,
  keySync: true,
  pitchDepth: 0,
  ampDepth: 0,
};

const env = (e: Partial<EnvelopeParams> = {}): EnvelopeParams => ({
  ...DEFAULT_ENVELOPE,
  ...e,
});

const op = (
  o: Partial<OscillatorParams> & {
    env?: Partial<EnvelopeParams>;
    keyScale?: Partial<KeyScaleParams>;
  } = {},
): OperatorParams => ({
  ...DEFAULT_OSCILLATOR,
  ...o,
  env: env(o.env),
  keyScale: { ...DEFAULT_KEY_SCALE, ...o.keyScale },
});

const lfo = (l: Partial<LfoParams> = {}): LfoParams => ({
  ...DEFAULT_LFO,
  ...l,
});

// Normalizers for untrusted data (localStorage, imported files): unknown or invalid
// fields fall back to defaults, and extra fields are dropped.

type Loose = Record<string, unknown>;
const asObject = (v: unknown): Loose =>
  typeof v === "object" && v !== null ? (v as Loose) : {};
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;
const oneOf = <T extends string>(
  v: unknown,
  options: readonly T[],
  fallback: T,
): T => (options.includes(v as T) ? (v as T) : fallback);
const pw = (v: unknown, fallback: number): number =>
  Math.min(Math.max(num(v, fallback), PW_MIN), PW_MAX);

// ---------------------------------------------------------------------------
// Routing

export const operatorIndex = (id: OperatorId): number =>
  OPERATOR_IDS.indexOf(id);

export interface Algorithm {
  label: string;
  formula: string;
  routing: Routing;
  /** Node positions in a 100 x 48 diagram. */
  diagram: Record<OperatorId, readonly [number, number]>;
}

const conn = (...pairs: [number, number | "out"][]): Routing => ({
  connections: pairs.map(([from, to]) => ({
    from: OPERATOR_IDS[from - 1]!,
    to: to === "out" ? "output" : OPERATOR_IDS[to - 1]!,
  })),
});

export const ALGORITHMS: readonly Algorithm[] = [
  {
    label: "SERIAL",
    formula: "1›2›3›4",
    routing: conn([1, 2], [2, 3], [3, 4], [4, "out"]),
    diagram: { op1: [12, 24], op2: [36, 24], op3: [60, 24], op4: [84, 24] },
  },
  {
    label: "MERGE",
    formula: "1+2›3›4",
    routing: conn([1, 3], [2, 3], [3, 4], [4, "out"]),
    diagram: { op1: [12, 12], op2: [12, 36], op3: [50, 24], op4: [84, 24] },
  },
  {
    label: "SPLIT",
    formula: "1+(2›3)›4",
    routing: conn([1, 4], [2, 3], [3, 4], [4, "out"]),
    diagram: { op1: [12, 12], op2: [12, 36], op3: [48, 36], op4: [84, 12] },
  },
  {
    label: "DIAMOND",
    formula: "1›(2·3)›4",
    routing: conn([1, 2], [1, 3], [2, 4], [3, 4], [4, "out"]),
    diagram: { op1: [12, 24], op2: [48, 12], op3: [48, 36], op4: [84, 24] },
  },
  {
    label: "DOUBLE",
    formula: "1›2 + 3›4",
    routing: conn([1, 2], [3, 4], [2, "out"], [4, "out"]),
    diagram: { op1: [12, 12], op2: [76, 12], op3: [12, 36], op4: [76, 36] },
  },
  {
    label: "FAN",
    formula: "1›2·3·4",
    routing: conn([1, 2], [1, 3], [1, 4], [2, "out"], [3, "out"], [4, "out"]),
    diagram: { op1: [12, 24], op2: [76, 8], op3: [76, 24], op4: [76, 40] },
  },
  {
    label: "PAIR",
    formula: "1›2 + 3 + 4",
    routing: conn([1, 2], [2, "out"], [3, "out"], [4, "out"]),
    diagram: { op1: [12, 8], op2: [76, 8], op3: [76, 24], op4: [76, 40] },
  },
  {
    label: "ADDITIVE",
    formula: "1 + 2 + 3 + 4",
    routing: conn([1, "out"], [2, "out"], [3, "out"], [4, "out"]),
    diagram: { op1: [76, 7], op2: [76, 18], op3: [76, 30], op4: [76, 41] },
  },
];

export const cloneRouting = (r: Routing): Routing => ({
  connections: r.connections.map((c) => ({ ...c })),
});

/** True when both routings contain the same set of connections (order-insensitive). */
export function routingMatches(a: Routing, b: Routing): boolean {
  const key = (r: Routing) =>
    r.connections
      .map(({ from, to }) => `${from}>${to}`)
      .sort()
      .join("|");
  return key(a) === key(b);
}

/**
 * Operator indices in evaluation order (every modulator before the operators it modulates),
 * or null when the modulation graph contains a cycle.
 */
export function routingOrder(r: Routing): number[] | null {
  const incoming = new Array<number>(OPERATOR_COUNT).fill(0);
  const outgoing: number[][] = Array.from({ length: OPERATOR_COUNT }, () => []);
  for (const { from, to } of r.connections) {
    if (to === "output") continue;
    incoming[operatorIndex(to)]!++;
    outgoing[operatorIndex(from)]!.push(operatorIndex(to));
  }
  const order: number[] = [];
  for (let i = 0; i < OPERATOR_COUNT; i++) if (incoming[i] === 0) order.push(i);
  for (let cursor = 0; cursor < order.length; cursor++) {
    for (const t of outgoing[order[cursor]!]!)
      if (--incoming[t]! === 0) order.push(t);
  }
  return order.length === OPERATOR_COUNT ? order : null;
}

/** Validates untrusted routing data; returns an error message, or null when it is valid. */
export function routingError(value: unknown): string | null {
  const connections = asObject(value).connections;
  if (!Array.isArray(connections))
    return "routing.connections must be an array.";
  const seen = new Set<string>();
  const targets: readonly string[] = [...OPERATOR_IDS, "output"];
  for (const [i, c] of connections.entries()) {
    const { from, to } = asObject(c);
    const path = `routing.connections[${i}]`;
    if (!OPERATOR_IDS.includes(from as OperatorId))
      return `${path}.from must be one of: ${OPERATOR_IDS.join(", ")}.`;
    if (!targets.includes(to as string))
      return `${path}.to must be one of: ${targets.join(", ")}.`;
    if (from === to)
      return `${path} connects ${from} to itself (use feedback instead).`;
    const key = `${from}>${to}`;
    if (seen.has(key)) return `${path} duplicates the ${key} connection.`;
    seen.add(key);
  }
  if (routingOrder(value as Routing) === null)
    return "routing.connections must not contain a cycle.";
  return null;
}

/** Keeps valid, unique connections; falls back to SERIAL when the result has a cycle. */
export function normalizeRouting(value: unknown): Routing {
  const list = asObject(value).connections;
  if (!Array.isArray(list)) return cloneRouting(ALGORITHMS[0]!.routing);
  const targets: readonly string[] = [...OPERATOR_IDS, "output"];
  const seen = new Set<string>();
  const connections: RoutingConnection[] = [];
  for (const c of list) {
    const { from, to } = asObject(c);
    if (
      !OPERATOR_IDS.includes(from as OperatorId) ||
      !targets.includes(to as string) ||
      from === to
    )
      continue;
    const key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    connections.push({ from: from as OperatorId, to: to as RoutingTarget });
  }
  const routing = { connections };
  return routingOrder(routing) ? routing : cloneRouting(ALGORITHMS[0]!.routing);
}

export function normalizeEnvelope(value: unknown): EnvelopeParams {
  const o = asObject(value);
  const d = DEFAULT_ENVELOPE;
  return {
    attack: num(o.attack, d.attack),
    d1: num(o.d1, d.d1),
    l1: num(o.l1, d.l1),
    d2: num(o.d2, d.d2),
    l2: num(o.l2, d.l2),
    release: num(o.release, d.release),
  };
}

export function normalizeOscillator(value: unknown): OscillatorParams {
  const o = asObject(value);
  const d = DEFAULT_OSCILLATOR;
  return {
    enabled: bool(o.enabled, d.enabled),
    wave: oneOf(o.wave, WAVEFORMS, d.wave),
    pw: pw(o.pw, d.pw),
    freqMode: oneOf(o.freqMode, ["ratio", "fixed"] as const, d.freqMode),
    ratio: num(o.ratio, d.ratio),
    fixed: num(o.fixed, d.fixed),
    detune: num(o.detune, d.detune),
    level: num(o.level, d.level),
    feedback: num(o.feedback, d.feedback),
    ams: num(o.ams, d.ams),
  };
}

export function normalizeKeyScale(value: unknown): KeyScaleParams {
  const o = asObject(value);
  const d = DEFAULT_KEY_SCALE;
  return {
    breakPoint: num(o.breakPoint, d.breakPoint),
    leftDepth: num(o.leftDepth, d.leftDepth),
    leftCurve: oneOf(o.leftCurve, KEY_SCALE_CURVES, d.leftCurve),
    rightDepth: num(o.rightDepth, d.rightDepth),
    rightCurve: oneOf(o.rightCurve, KEY_SCALE_CURVES, d.rightCurve),
    rate: num(o.rate, d.rate),
  };
}

export function normalizeOperator(value: unknown): OperatorParams {
  const o = asObject(value);
  return {
    ...normalizeOscillator(value),
    env: normalizeEnvelope(o.env),
    keyScale: normalizeKeyScale(o.keyScale),
  };
}

export function normalizeLfo(value: unknown): LfoParams {
  const o = asObject(value);
  const d = DEFAULT_LFO;
  return {
    enabled: bool(o.enabled, d.enabled),
    wave: oneOf(o.wave, LFO_WAVEFORMS, d.wave),
    pw: pw(o.pw, d.pw),
    rate: num(o.rate, d.rate),
    // Patches saved before `fade` existed used `delay` as the fade-in time.
    ...(o.fade === undefined && typeof o.delay === "number"
      ? { delay: d.delay, fade: num(o.delay, d.fade) }
      : { delay: num(o.delay, d.delay), fade: num(o.fade, d.fade) }),
    keySync: bool(o.keySync, d.keySync),
    pitchDepth: num(o.pitchDepth, d.pitchDepth),
    ampDepth: num(o.ampDepth, d.ampDepth),
  };
}

export function normalizeOperators(value: unknown): Operators {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: OPERATOR_COUNT }, (_, i) =>
    normalizeOperator(list[i]),
  ) as Operators;
}

export function normalizePatch(value: unknown): Patch {
  const o = asObject(value);
  return {
    operators: normalizeOperators(o.operators),
    routing: normalizeRouting(o.routing),
    lfo: normalizeLfo(o.lfo),
  };
}

const route = (label: string): Routing =>
  cloneRouting(ALGORITHMS.find((a) => a.label === label)!.routing);

const off = { enabled: false, level: 0 } as const;

export const PRESETS: Record<string, Patch> = {
  Init: {
    operators: [
      op({ level: 0 }),
      op({ level: 0 }),
      op({ level: 0.3 }),
      op({ level: 0.8, env: { l1: 1, l2: 1 } }),
    ],
    routing: route("SERIAL"),
    lfo: lfo(),
  },
  Piano: {
    // Acoustic piano: a fixed-pitch hammer thump (OP1) next to the strings (2 + 3 -> 4).
    // OP2 and OP3 share the same detune so that the partials stretch slightly without
    // landing next to each other, which would make the low register beat.
    operators: [
      op({
        freqMode: "fixed",
        fixed: 70,
        level: 0.15,
        feedback: 0.55,
        env: {
          attack: 0.001,
          d1: 0.05,
          l1: 0.3,
          d2: 0.15,
          l2: 0,
          release: 0.1,
        },
        keyScale: { leftDepth: -6, rightDepth: 2 },
      }),
      op({
        ratio: 7,
        detune: 2,
        level: 0.04,
        feedback: 0.06,
        env: {
          attack: 0.001,
          d1: 0.14,
          l1: 0.66,
          d2: 5.4,
          l2: 0.19,
          release: 0.2,
        },
        keyScale: { leftDepth: 7.5, rightDepth: -14.5, rate: 0.6 },
      }),
      op({
        ratio: 1,
        detune: 2,
        level: 0.12,
        feedback: 0.04,
        env: {
          attack: 0.001,
          d1: 0.27,
          l1: 0.7,
          d2: 2.4,
          l2: 0.42,
          release: 0.2,
        },
        keyScale: {
          leftDepth: 4.75,
          leftCurve: "exp",
          rightDepth: -6.25,
          rate: 0.42,
        },
      }),
      op({
        ratio: 1,
        level: 0.8,
        feedback: 0.045,
        env: { attack: 0.002, d1: 0.4, l1: 0.3, d2: 2.8, l2: 0, release: 0.2 },
        keyScale: { rate: 0.7 },
      }),
    ],
    routing: conn([1, "out"], [2, 4], [3, 4], [4, "out"]),
    lfo: lfo(),
  },
  "E.Piano": {
    // Tine (1 -> 2) layered with the body (3 -> 4), as on the DX7 E.Piano.
    operators: [
      op({
        ratio: 14,
        level: 0.1,
        env: { attack: 0.001, d1: 0.08, l1: 0.1, d2: 0.4, l2: 0, release: 0.2 },
      }),
      op({
        ratio: 1,
        level: 0.55,
        env: { attack: 0.001, d1: 0.5, l1: 0.3, d2: 2, l2: 0, release: 0.3 },
      }),
      op({
        ratio: 1,
        level: 0.4,
        feedback: 0.1,
        env: {
          attack: 0.001,
          d1: 0.25,
          l1: 0.25,
          d2: 1.5,
          l2: 0,
          release: 0.3,
        },
      }),
      op({
        ratio: 1,
        detune: 3,
        level: 0.85,
        env: { attack: 0.002, d1: 0.8, l1: 0.55, d2: 3, l2: 0, release: 0.4 },
      }),
    ],
    routing: route("DOUBLE"),
    lfo: lfo(),
  },
  Brass: {
    operators: [
      op({
        ratio: 1,
        level: 0.35,
        feedback: 0.35,
        env: {
          attack: 0.08,
          d1: 0.15,
          l1: 0.8,
          d2: 0.6,
          l2: 0.65,
          release: 0.2,
        },
      }),
      op({
        ratio: 1,
        level: 0.3,
        env: { attack: 0.06, d1: 0.2, l1: 0.7, d2: 0.8, l2: 0.6, release: 0.2 },
      }),
      op({
        ratio: 2,
        level: 0.15,
        env: { attack: 0.07, d1: 0.2, l1: 0.6, d2: 0.8, l2: 0.5, release: 0.2 },
      }),
      op({
        ratio: 1,
        level: 0.75,
        env: { attack: 0.05, d1: 0.1, l1: 1, d2: 0.5, l2: 0.85, release: 0.25 },
      }),
    ],
    routing: route("SPLIT"),
    lfo: lfo({
      wave: "sine",
      rate: 5.5,
      delay: 0.3,
      fade: 0.5,
      pitchDepth: 12,
    }),
  },
  "Slap Bass": {
    // A single carrier an octave below the key, so the pluck and the body are one tone.
    // OP1 (1:1) gives the body; OP2 -> OP3 adds a stacked 10:1 twang that stays bright for
    // about 150 ms. The twang dies out, while the body settles to a soft sustain.
    operators: [
      op({
        ratio: 0.5,
        level: 0.465,
        env: {
          attack: 0,
          d1: 0.88,
          l1: 0.155,
          d2: 0.63,
          l2: 0.06,
          release: 0.3,
        },
      }),
      op({
        ratio: 5,
        level: 0.155,
        env: {
          attack: 0,
          d1: 0.3,
          l1: 0.305,
          d2: 0.77,
          l2: 0.145,
          release: 0.3,
        },
      }),
      op({
        ratio: 0.5,
        level: 0.37,
        env: {
          attack: 0.001,
          d1: 0.42,
          l1: 0.155,
          d2: 0.63,
          l2: 0,
          release: 0.3,
        },
      }),
      op({
        ratio: 0.5,
        level: 1,
        env: {
          attack: 0.001,
          d1: 0.42,
          l1: 0.3,
          d2: 1.2,
          l2: 0.18,
          release: 0.3,
        },
      }),
    ],
    routing: route("SPLIT"),
    lfo: lfo(),
  },
  Bell: {
    operators: [
      op({
        ratio: 3.5,
        level: 0.5,
        env: { attack: 0.001, d1: 1.2, l1: 0.3, d2: 3, l2: 0, release: 2 },
      }),
      op({
        ratio: 1,
        level: 0.7,
        env: { attack: 0.001, d1: 2, l1: 0.4, d2: 4, l2: 0, release: 2.5 },
      }),
      op({
        freqMode: "fixed",
        fixed: 1720,
        level: 0.3,
        env: { attack: 0.001, d1: 0.4, l1: 0.1, d2: 1, l2: 0, release: 1 },
      }),
      op({
        ratio: 2,
        detune: 7,
        level: 0.4,
        env: { attack: 0.001, d1: 1, l1: 0.3, d2: 2.5, l2: 0, release: 2 },
      }),
    ],
    routing: route("DOUBLE"),
    lfo: lfo(),
  },
  "Square Lead": {
    operators: [
      // Detuned like OP2 so that the 2:1 ratio stays exact (otherwise the timbre pulses).
      op({
        wave: "square",
        ratio: 2,
        detune: 5,
        level: 0.12,
        env: { attack: 0.01, d1: 0.3, l1: 0.6, d2: 0.5, l2: 0.5 },
      }),
      op({
        wave: "square",
        ratio: 1,
        detune: 5,
        level: 0.45,
        env: { attack: 0.005, d1: 0.1, l1: 1, d2: 0.3, l2: 0.9, release: 0.15 },
      }),
      op({
        wave: "sawtooth",
        ratio: 1,
        detune: -5,
        level: 0.3,
        env: { attack: 0.005, d1: 0.1, l1: 1, d2: 0.3, l2: 0.9, release: 0.15 },
      }),
      op(off),
    ],
    routing: route("PAIR"),
    lfo: lfo({ rate: 6, delay: 0.2, fade: 0.4, pitchDepth: 25 }),
  },
  "Noise Snare": {
    // Noise modulating three fixed-pitch bodies.
    operators: [
      op({
        wave: "noise",
        level: 0.9,
        env: { attack: 0.001, d1: 0.12, l1: 0.3, d2: 0.2, l2: 0, release: 0.1 },
      }),
      op({
        freqMode: "fixed",
        fixed: 180,
        level: 0.8,
        env: {
          attack: 0.001,
          d1: 0.08,
          l1: 0.3,
          d2: 0.25,
          l2: 0,
          release: 0.1,
        },
      }),
      op({
        freqMode: "fixed",
        fixed: 330,
        level: 0.5,
        env: { attack: 0.001, d1: 0.06, l1: 0.2, d2: 0.2, l2: 0, release: 0.1 },
      }),
      op({
        freqMode: "fixed",
        fixed: 1200,
        level: 0.3,
        env: {
          attack: 0.001,
          d1: 0.05,
          l1: 0.1,
          d2: 0.1,
          l2: 0,
          release: 0.08,
        },
      }),
    ],
    routing: route("FAN"),
    lfo: lfo(),
  },
  Organ: {
    // Drawbar-like: 16', 8', 4' and 2 2/3' sine partials.
    operators: [
      op({
        ratio: 0.5,
        level: 0.6,
        env: { attack: 0.005, d1: 0.01, l1: 1, d2: 0.01, l2: 1, release: 0.05 },
      }),
      op({
        ratio: 1,
        level: 0.7,
        env: { attack: 0.005, d1: 0.01, l1: 1, d2: 0.01, l2: 1, release: 0.05 },
      }),
      op({
        ratio: 2,
        level: 0.45,
        env: { attack: 0.005, d1: 0.01, l1: 1, d2: 0.01, l2: 1, release: 0.05 },
      }),
      op({
        ratio: 3,
        level: 0.35,
        env: { attack: 0.005, d1: 0.01, l1: 1, d2: 0.01, l2: 1, release: 0.05 },
      }),
    ],
    routing: route("ADDITIVE"),
    lfo: lfo({ wave: "sine", rate: 6.5, pitchDepth: 6 }),
  },
  "Glass Pad": {
    // Glassy shimmer (1 -> 2): a non-integer ratio gives inharmonic partials that are bright
    // at note on and settle quickly. Soft pad body (3 -> 4): a nearly pure sine swelling in.
    operators: [
      op({
        ratio: 3.5,
        level: 0.15,
        env: { attack: 0.001, d1: 0.8, l1: 0.3, d2: 3, l2: 0.15, release: 1.5 },
      }),
      op({
        ratio: 2,
        level: 0.3,
        ams: 0.3,
        env: { attack: 0.005, d1: 1.5, l1: 0.6, d2: 3, l2: 0.35, release: 2 },
      }),
      op({
        ratio: 1,
        level: 0.05,
        env: { attack: 0.8, d1: 1, l1: 1, d2: 2, l2: 1, release: 2 },
      }),
      op({
        ratio: 1,
        detune: 4,
        level: 0.8,
        ams: 0.5,
        env: { attack: 0.6, d1: 1, l1: 1, d2: 2, l2: 0.9, release: 2 },
      }),
    ],
    routing: route("DOUBLE"),
    lfo: lfo({ wave: "triangle", rate: 0.4, ampDepth: 0.3 }),
  },
};

// structuredClone is unavailable in AudioWorkletGlobalScope, and a Patch is plain JSON anyway.
export const clonePatch = (p: Patch): Patch => JSON.parse(JSON.stringify(p));

export const noteToFreq = (note: number): number =>
  440 * 2 ** ((note - 69) / 12);
