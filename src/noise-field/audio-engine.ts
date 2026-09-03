import { createImpulseResponse } from "./impulse-response";
import type { NoiseAudioGraph, NoiseState } from "./types";

type AudioContextConstructor = new (
  options?: AudioContextOptions,
) => AudioContext;

const workletCode = `class WhiteNoiseGenerator extends AudioWorkletProcessor { process(inputs, outputs) { for (const channel of outputs[0]) { for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * .5; } return true; } } registerProcessor('white-noise-generator', WhiteNoiseGenerator);`;

function audioContextConstructor(): AudioContextConstructor {
  const legacyWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const Context = window.AudioContext ?? legacyWindow.webkitAudioContext;
  if (!Context) throw new Error("Web Audio is not supported by this browser.");
  return Context;
}

export function volumeToGain(value: number): number {
  return (value / 100) ** 1.7 * 0.72;
}

export class NoiseAudioEngine {
  private filterTimer: number | null = null;

  constructor(private readonly state: NoiseState) {}

  async toggle(volume: number): Promise<boolean> {
    if (!this.state.audio)
      this.state.audio = await this.create(this.state.curve);
    const audio = this.state.audio;
    if (audio.context.state === "suspended") await audio.context.resume();
    this.state.playing = !this.state.playing;
    const now = audio.context.currentTime;
    audio.gain.gain.cancelScheduledValues(now);
    audio.gain.gain.setValueAtTime(audio.gain.gain.value, now);
    audio.gain.gain.linearRampToValueAtTime(
      this.state.playing ? volumeToGain(volume) : 0,
      now + 0.18,
    );
    return this.state.playing;
  }

  updateCurve(curve: readonly number[]): void {
    if (this.filterTimer !== null) window.clearTimeout(this.filterTimer);
    this.filterTimer = window.setTimeout(() => this.updateFilter(curve), 90);
  }

  setHighCut(value: number): void {
    this.setParam(this.state.audio?.lowpass.frequency, value);
  }
  setLowCut(value: number): void {
    this.setParam(this.state.audio?.highpass.frequency, value);
  }
  setVolume(value: number): void {
    if (this.state.playing)
      this.setParam(this.state.audio?.gain.gain, volumeToGain(value));
  }

  dispose(): void {
    if (this.filterTimer !== null) window.clearTimeout(this.filterTimer);
    this.filterTimer = null;
    const audio = this.state.audio;
    if (!audio) return;
    audio.source.disconnect();
    audio.highpass.disconnect();
    audio.inputTrim.disconnect();
    for (const node of audio.convolvers) node.disconnect();
    for (const node of audio.filterGains) node.disconnect();
    audio.lowpass.disconnect();
    audio.limiter.disconnect();
    audio.analyser.disconnect();
    audio.gain.disconnect();
    if (audio.context.state !== "closed") void audio.context.close();
    this.state.audio = null;
    this.state.playing = false;
  }

  private setParam(param: AudioParam | undefined, value: number): void {
    const context = this.state.audio?.context;
    if (param && context)
      param.setTargetAtTime(value, context.currentTime, 0.025);
  }

  private updateFilter(curve: readonly number[]): void {
    this.filterTimer = null;
    const audio = this.state.audio;
    if (!audio) return;
    const next: 0 | 1 = audio.activeConvolver === 0 ? 1 : 0;
    audio.convolvers[next].buffer = createImpulseResponse(audio.context, curve);
    const now = audio.context.currentTime;
    for (const gain of audio.filterGains) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
    }
    audio.filterGains[audio.activeConvolver].gain.linearRampToValueAtTime(
      0,
      now + 0.06,
    );
    audio.filterGains[next].gain.linearRampToValueAtTime(1, now + 0.06);
    audio.activeConvolver = next;
  }

  private async create(curve: readonly number[]): Promise<NoiseAudioGraph> {
    const Context = audioContextConstructor();
    const context = new Context({ latencyHint: "interactive" });
    const blobUrl = URL.createObjectURL(
      new Blob([workletCode], { type: "text/javascript" }),
    );
    try {
      await context.audioWorklet.addModule(blobUrl);
    } catch (error) {
      if (context.state !== "closed") await context.close();
      throw error;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    const source = new AudioWorkletNode(context, "white-noise-generator", {
      outputChannelCount: [2],
    });
    const highpass = new BiquadFilterNode(context, {
      type: "highpass",
      frequency: 20,
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: Preserve the existing filter tuning exactly.
      Q: 0.707,
    });
    const inputTrim = new GainNode(context, { gain: 0.28 });
    const convolvers: [ConvolverNode, ConvolverNode] = [
      context.createConvolver(),
      context.createConvolver(),
    ];
    for (const convolver of convolvers) {
      convolver.normalize = false;
      convolver.buffer = createImpulseResponse(context, curve);
    }
    const filterGains: [GainNode, GainNode] = [
      new GainNode(context, { gain: 1 }),
      new GainNode(context, { gain: 0 }),
    ];
    const lowpass = new BiquadFilterNode(context, {
      type: "lowpass",
      frequency: 20000,
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: Preserve the existing filter tuning exactly.
      Q: 0.707,
    });
    const limiter = new DynamicsCompressorNode(context, {
      threshold: -3,
      knee: 3,
      ratio: 12,
      attack: 0.002,
      release: 0.12,
    });
    const analyser = new AnalyserNode(context, {
      fftSize: 2048,
      smoothingTimeConstant: 0.82,
    });
    const gain = new GainNode(context, { gain: 0 });
    source.connect(highpass).connect(inputTrim);
    inputTrim.connect(convolvers[0]).connect(filterGains[0]).connect(lowpass);
    inputTrim.connect(convolvers[1]).connect(filterGains[1]).connect(lowpass);
    lowpass
      .connect(limiter)
      .connect(analyser)
      .connect(gain)
      .connect(context.destination);
    return {
      context,
      source,
      highpass,
      inputTrim,
      convolvers,
      filterGains,
      activeConvolver: 0,
      lowpass,
      limiter,
      analyser,
      gain,
    };
  }
}
