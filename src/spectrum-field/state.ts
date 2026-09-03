export interface SpectrumState {
  context: AudioContext | null;
  source: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
  gain: GainNode | null;
  decodeContext: AudioContext | null;
  file: File | null;
  objectUrl: string | null;
  buffer: AudioBuffer | null;
  channelCount: number | null;
  frequencyData: Float32Array<ArrayBuffer> | null;
  spectrumLevels: number[];
  peaks: number[];
  hasSpectrum: boolean;
  dragging: boolean;
  loadVersion: number;
  animationFrame: number | null;
}

export function createInitialState(): SpectrumState {
  return {
    context: null,
    source: null,
    analyser: null,
    gain: null,
    decodeContext: null,
    file: null,
    objectUrl: null,
    buffer: null,
    channelCount: null,
    frequencyData: null,
    spectrumLevels: [],
    peaks: [],
    hasSpectrum: false,
    dragging: false,
    loadVersion: 0,
    animationFrame: null,
  };
}
