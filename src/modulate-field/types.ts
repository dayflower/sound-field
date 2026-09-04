export type Waveform = "sine" | "square" | "triangle" | "sawtooth" | "white";
export type FrequencyMode = "ratio" | "fixed";
export type OperatorId = "op1" | "op2" | "op3" | "op4";
export type RoutingTarget = OperatorId | "output";

export interface EnvelopeSettings {
  attack: number;
  segment1Time: number;
  segment1Level: number;
  segment2Time: number;
  segment2Level: number;
  release: number;
}

export interface OperatorSettings {
  enabled: boolean;
  waveform: Waveform;
  frequencyMode: FrequencyMode;
  ratio: number;
  fixedHz: number;
  detune: number;
  level: number;
  modulationIndex: number;
  feedback: number;
  envelope: EnvelopeSettings;
}

export interface SynthPatch {
  version: 1;
  name: string;
  routing: OperatorRouting;
  masterGain: number;
  operators: [
    OperatorSettings,
    OperatorSettings,
    OperatorSettings,
    OperatorSettings,
  ];
}

export interface RoutingConnection {
  from: OperatorId;
  to: RoutingTarget;
}

export interface OperatorRouting {
  connections: RoutingConnection[];
}

export interface RoutingPreset {
  id: number;
  label: string;
  formula: string;
  routing: OperatorRouting;
  diagram: Record<OperatorId, readonly [number, number]>;
}
