// Audio graph: FM worklet -> master gain -> analyser -> destination

import workletUrl from "../worklet/fm-processor.ts?worker&url";
import type { FromWorklet, Patch, ToWorklet } from "./patch";

export class AudioEngine {
  readonly analyser: AnalyserNode;
  onEnvelope: ((msg: FromWorklet) => void) | null = null;

  private constructor(
    readonly ctx: AudioContext,
    private readonly node: AudioWorkletNode,
    private readonly master: GainNode,
  ) {
    this.analyser = new AnalyserNode(ctx, {
      fftSize: 4096,
      smoothingTimeConstant: 0.5,
    });
    node.connect(master).connect(this.analyser).connect(ctx.destination);
    node.port.onmessage = (e: MessageEvent<FromWorklet>) =>
      this.onEnvelope?.(e.data);
  }

  static async create(): Promise<AudioEngine> {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    try {
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, "fm-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const master = new GainNode(ctx, { gain: 0 });
      await ctx.resume();
      return new AudioEngine(ctx, node, master);
    } catch (error) {
      await ctx.close();
      throw error;
    }
  }

  private send(msg: ToWorklet): void {
    this.node.port.postMessage(msg);
  }

  setPatch(patch: Patch): void {
    this.send({ type: "patch", patch });
  }

  noteOn(note: number, velocity = 0.9): void {
    this.send({ type: "noteOn", note, velocity });
  }

  noteOff(note: number): void {
    this.send({ type: "noteOff", note });
  }

  allNotesOff(): void {
    this.send({ type: "allNotesOff" });
  }

  /** Sets the master gain with a short ramp to avoid zipper noise. */
  setMasterGain(gain: number): void {
    this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
  }

  async dispose(): Promise<void> {
    this.allNotesOff();
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.master.disconnect();
    this.analyser.disconnect();
    await this.ctx.close();
  }
}
