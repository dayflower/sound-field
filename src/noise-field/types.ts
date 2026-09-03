import type { AnalysisMode, AudioBufferData } from "./audio-analysis";

export type PresetId =
  | "white"
  | "pink"
  | "brown"
  | "blue"
  | "violet"
  | "grey"
  | "custom";
export type EditorMode = "curve" | "band";
export type NoiseAnalysisMode = AnalysisMode;

export interface NoisePreset {
  id: PresetId;
  en: string;
  levels: readonly number[] | null;
}

export interface NoiseAudioGraph {
  context: AudioContext;
  source: AudioWorkletNode;
  highpass: BiquadFilterNode;
  inputTrim: GainNode;
  convolvers: readonly [ConvolverNode, ConvolverNode];
  filterGains: readonly [GainNode, GainNode];
  activeConvolver: 0 | 1;
  lowpass: BiquadFilterNode;
  limiter: DynamicsCompressorNode;
  analyser: AnalyserNode;
  gain: GainNode;
}

export interface NoiseState {
  type: PresetId;
  levels: number[];
  customLevels: number[];
  curve: number[];
  customCurve: number[];
  playing: boolean;
  startedAt: number;
  elapsedBefore: number;
  audio: NoiseAudioGraph | null;
  importedBuffer: AudioBufferData | null;
  importedFileName: string;
  editorMode: EditorMode;
  drawingCurve: boolean;
  lastCurveIndex: number | null;
  animationFrame: number | null;
  clockTimer: number | null;
}
