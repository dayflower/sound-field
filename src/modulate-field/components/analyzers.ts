// Real-time oscilloscope and spectrum analyzer backed by an AnalyserNode.
import { COLORS, prepareCanvas } from "./canvas";
import { BlackmanHarrisSpectrum } from "./fft";

export class Oscilloscope {
  private readonly data: Float32Array<ArrayBuffer>;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly analyser: AnalyserNode,
  ) {
    this.data = new Float32Array(analyser.fftSize);
  }

  draw(): void {
    const { ctx, w, h } = prepareCanvas(this.canvas);
    const mid = h / 2;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = Math.round((w * i) / 8) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (const y of [h / 4, mid, (h * 3) / 4]) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();

    this.analyser.getFloatTimeDomainData(this.data);
    const view = this.data.length / 2;
    const start = this.findTrigger(view);

    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i < view; i++) {
      const x = (i / (view - 1)) * w;
      const y = mid - this.data[start + i]! * mid * 0.95;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /** Finds a rising zero crossing so that periodic waveforms appear stable. */
  private findTrigger(view: number): number {
    const d = this.data;
    for (let i = 1; i < d.length - view; i++) {
      if (d[i - 1]! < 0 && d[i]! >= 0) return i;
    }
    return 0;
  }
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
// const MIN_DB = -110;
const MIN_DB = -90;
const MAX_DB = -10;

/**
 * "native" uses AnalyserNode's built-in FFT (Blackman window, visible sidelobes);
 * "bh" runs a JS FFT with a Blackman-Harris window for a cleaner noise floor.
 */
export type SpectrumMode = "native" | "bh";

export class SpectrumAnalyzer {
  private readonly data: Float32Array<ArrayBuffer>;
  private readonly timeData: Float32Array<ArrayBuffer>;
  private readonly bh: BlackmanHarrisSpectrum;
  private currentMode: SpectrumMode = "native";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly analyser: AnalyserNode,
  ) {
    this.data = new Float32Array(analyser.frequencyBinCount);
    this.timeData = new Float32Array(analyser.fftSize);
    this.bh = new BlackmanHarrisSpectrum(analyser.fftSize);
  }

  get mode(): SpectrumMode {
    return this.currentMode;
  }

  set mode(mode: SpectrumMode) {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.bh.reset();
  }

  private fetchSpectrum(): void {
    if (this.currentMode === "native") {
      this.analyser.getFloatFrequencyData(this.data);
    } else {
      this.analyser.getFloatTimeDomainData(this.timeData);
      this.bh.compute(
        this.timeData,
        this.data,
        this.analyser.smoothingTimeConstant,
      );
    }
  }

  draw(): void {
    const { ctx, w, h } = prepareCanvas(this.canvas);
    const xOf = (f: number) =>
      (Math.log(f / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ)) * w;
    const yOf = (db: number) => ((MAX_DB - db) / (MAX_DB - MIN_DB)) * h;

    ctx.font = "10px ui-monospace, monospace";
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.gridLabel;
    ctx.beginPath();
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = Math.round(xOf(f)) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x + 3, h - 4);
    }
    for (let db = -100; db <= -20; db += 20) {
      const y = Math.round(yOf(db)) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.fillText(`${db}dB`, 3, y - 3);
    }
    ctx.stroke();

    this.fetchSpectrum();
    const binHz = this.analyser.context.sampleRate / this.analyser.fftSize;

    ctx.beginPath();
    ctx.moveTo(0, h);
    // One point per horizontal pixel: interpolate between bins where they are wider than
    // a pixel (low end), take the max of the covered bins where they are narrower (high end).
    const last = this.data.length - 1;
    for (let px = 0; px <= w; px++) {
      const f0 = MIN_FREQ * (MAX_FREQ / MIN_FREQ) ** (px / w);
      const f1 = MIN_FREQ * (MAX_FREQ / MIN_FREQ) ** ((px + 1) / w);
      const b0 = Math.floor(f0 / binHz);
      const b1 = Math.min(last, Math.floor(f1 / binHz));
      let db: number;
      if (b1 <= b0 + 1) {
        const pos = Math.min(last - 1, f0 / binHz);
        const i = Math.floor(pos);
        db = this.data[i]! + (this.data[i + 1]! - this.data[i]!) * (pos - i);
      } else {
        db = -Infinity;
        for (let b = b0; b <= b1; b++) db = Math.max(db, this.data[b]!);
      }
      ctx.lineTo(px, Math.min(h, Math.max(0, yOf(db))));
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(90, 209, 230, 0.55)");
    grad.addColorStop(1, "rgba(90, 209, 230, 0.03)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = COLORS.secondary;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}
