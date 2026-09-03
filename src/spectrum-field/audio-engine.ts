import type { SpectrumState } from "./state";

type AudioContextConstructor = new (
  options?: AudioContextOptions,
) => AudioContext;

export interface AudioGraphOptions {
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  gain: number;
}

export interface PreparedFile {
  objectUrl: string;
}

function audioContextConstructor(): AudioContextConstructor {
  const legacyWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const Context = window.AudioContext ?? legacyWindow.webkitAudioContext;
  if (!Context) throw new Error("Web Audio is not supported by this browser.");
  return Context;
}

export class AudioEngine {
  constructor(
    private readonly audio: HTMLAudioElement,
    private readonly state: SpectrumState,
  ) {}

  async ensureGraph(options: AudioGraphOptions): Promise<void> {
    if (!this.state.context) {
      const Context = audioContextConstructor();
      const context = new Context({ latencyHint: "interactive" });
      const source = context.createMediaElementSource(this.audio);
      const analyser = new AnalyserNode(context, {
        fftSize: options.fftSize,
        smoothingTimeConstant: options.smoothingTimeConstant,
        minDecibels: options.minDecibels,
        maxDecibels: -10,
      });
      const gain = new GainNode(context, { gain: options.gain });
      source.connect(analyser).connect(gain).connect(context.destination);
      this.state.context = context;
      this.state.source = source;
      this.state.analyser = analyser;
      this.state.gain = gain;
    }
    if (this.state.context.state === "suspended")
      await this.state.context.resume();
  }

  prepareFile(file: File): PreparedFile {
    this.pause();
    this.revokeObjectUrl();
    this.state.file = file;
    this.state.buffer = null;
    this.state.channelCount = null;
    this.state.frequencyData = null;
    this.state.spectrumLevels = [];
    this.state.peaks = [];
    this.state.hasSpectrum = false;
    const objectUrl = URL.createObjectURL(file);
    this.state.objectUrl = objectUrl;
    this.audio.src = objectUrl;
    this.audio.load();
    return { objectUrl };
  }

  async decodeFile(file: File, loadVersion: number): Promise<AudioBuffer> {
    const Context = audioContextConstructor();
    const context = new Context();
    if (loadVersion === this.state.loadVersion)
      this.state.decodeContext = context;
    try {
      const encoded = await file.arrayBuffer();
      return await context.decodeAudioData(encoded.slice(0));
    } finally {
      if (context.state !== "closed") await context.close();
      if (this.state.decodeContext === context) this.state.decodeContext = null;
    }
  }

  pause(): void {
    if (!this.audio.paused) this.audio.pause();
  }

  revokeObjectUrl(): void {
    if (!this.state.objectUrl) return;
    URL.revokeObjectURL(this.state.objectUrl);
    this.state.objectUrl = null;
  }

  dispose(): void {
    this.state.loadVersion += 1;
    this.pause();
    this.revokeObjectUrl();
    const decodeContext = this.state.decodeContext;
    this.state.decodeContext = null;
    if (decodeContext && decodeContext.state !== "closed") {
      void decodeContext.close();
    }
    this.state.source?.disconnect();
    this.state.analyser?.disconnect();
    this.state.gain?.disconnect();
    if (this.state.context && this.state.context.state !== "closed") {
      void this.state.context.close();
    }
    this.state.context = null;
    this.state.source = null;
    this.state.analyser = null;
    this.state.gain = null;
  }
}
