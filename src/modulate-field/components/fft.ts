// Magnitude spectrum with a 4-term Blackman-Harris window, computed in JS.
// Mirrors AnalyserNode's output (smoothed magnitudes in dBFS) but with ~-92 dB sidelobes
// instead of the ~-58 dB of the Blackman window AnalyserNode is required to use.

// Coherent gains of the two windows; used to keep peak levels identical to AnalyserNode's.
const BLACKMAN_GAIN = 0.42;
const BH = [0.35875, 0.48829, 0.14128, 0.01168] as const;

export class BlackmanHarrisSpectrum {
  private readonly rev: Uint32Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly window: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly smoothed: Float64Array;

  constructor(readonly size: number) {
    const bits = Math.log2(size);
    if (!Number.isInteger(bits))
      throw new Error(`FFT size must be a power of two: ${size}`);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    this.window = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const x = (2 * Math.PI * i) / size;
      this.window[i] =
        BH[0] -
        BH[1] * Math.cos(x) +
        BH[2] * Math.cos(2 * x) -
        BH[3] * Math.cos(3 * x);
    }
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.smoothed = new Float64Array(size / 2);
  }

  reset(): void {
    this.smoothed.fill(0);
  }

  /** Writes smoothed magnitudes in dB for `input` (length `size`) into `out` (length `size / 2`). */
  compute(input: Float32Array, out: Float32Array, smoothing: number): void {
    const { size, rev, cos, sin, window, re, im, smoothed } = this;
    for (let i = 0; i < size; i++) {
      re[rev[i]!] = input[i]! * window[i]!;
      im[rev[i]!] = 0;
    }
    // Iterative radix-2 decimation-in-time FFT.
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let s = 0; s < size; s += len) {
        for (let j = 0; j < half; j++) {
          const t = j * step;
          const a = s + j;
          const b = a + half;
          const tr = re[b]! * cos[t]! - im[b]! * sin[t]!;
          const ti = re[b]! * sin[t]! + im[b]! * cos[t]!;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a] = re[a]! + tr;
          im[a] = im[a]! + ti;
        }
      }
    }
    const scale = BLACKMAN_GAIN / BH[0] / size;
    for (let i = 0; i < size / 2; i++) {
      const mag = Math.hypot(re[i]!, im[i]!) * scale;
      smoothed[i] = smoothing * smoothed[i]! + (1 - smoothing) * mag;
      out[i] = 20 * Math.log10(smoothed[i]!);
    }
  }
}
