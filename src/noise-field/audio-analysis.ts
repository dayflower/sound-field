import { fft } from "./fft";
import {
  CURVE_SIZE,
  MAX_FREQUENCY,
  clampGain,
  curveFrequency,
} from "./spectrum-curve";

export type AnalysisMode = "mean" | "median";

export interface AudioBufferData {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export type AudioAnalysisErrorCode = "too-short" | "no-signal" | "invalid-mode";

export class AudioAnalysisError extends Error {
  constructor(readonly code: AudioAnalysisErrorCode) {
    super(code);
    this.name = "AudioAnalysisError";
  }
}

function aggregate(values: readonly number[], mode: AnalysisMode): number {
  if (mode === "mean") {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function analyzeAudioBuffer(
  buffer: AudioBufferData,
  mode: AnalysisMode | string,
): number[] {
  if (mode !== "mean" && mode !== "median") {
    throw new AudioAnalysisError("invalid-mode");
  }
  if (buffer.length < 64) throw new AudioAnalysisError("too-short");

  const windowSize = 2 ** Math.floor(Math.log2(Math.min(8192, buffer.length)));
  const available = Math.max(0, buffer.length - windowSize);
  const windowCount = Math.min(
    48,
    Math.max(1, Math.floor(buffer.length / windowSize)),
  );
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  const real = new Float64Array(windowSize);
  const imaginary = new Float64Array(windowSize);
  const powersByPoint = Array.from(
    { length: CURVE_SIZE },
    () => [] as number[],
  );

  for (let frame = 0; frame < windowCount; frame++) {
    const start =
      windowCount === 1
        ? 0
        : Math.round((available * frame) / (windowCount - 1));
    for (let index = 0; index < windowSize; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[start + index] || 0;
      const hann =
        0.5 -
        0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, windowSize - 1));
      real[index] = (sample / channels.length) * hann;
    }
    imaginary.fill(0);
    fft(real, imaginary);
    powersByPoint.forEach((values, point) => {
      const center = curveFrequency(point);
      if (center >= buffer.sampleRate * 0.5) {
        values.push(0);
        return;
      }
      const lowerFrequency =
        point === 0 ? 20 : Math.sqrt(curveFrequency(point - 1) * center);
      const upperFrequency =
        point === CURVE_SIZE - 1
          ? MAX_FREQUENCY
          : Math.sqrt(center * curveFrequency(point + 1));
      const firstBin = Math.max(
        1,
        Math.floor((lowerFrequency / buffer.sampleRate) * windowSize),
      );
      const lastBin = Math.min(
        windowSize / 2 - 1,
        Math.ceil((upperFrequency / buffer.sampleRate) * windowSize),
      );
      let peakPower = 0;
      for (let bin = firstBin; bin <= lastBin; bin++) {
        peakPower = Math.max(
          peakPower,
          (real[bin] ?? 0) ** 2 + (imaginary[bin] ?? 0) ** 2,
        );
      }
      values.push(peakPower);
    });
  }

  const curvePowers = powersByPoint.map((values) =>
    values.length === 0 ? 0 : aggregate(values, mode),
  );
  const strongest = Math.max(...curvePowers);
  if (!Number.isFinite(strongest) || strongest < 1e-8) {
    throw new AudioAnalysisError("no-signal");
  }
  return curvePowers.map((power) => {
    const relativeDb =
      10 * Math.log10(Math.max(power, strongest * 1e-6) / strongest);
    return clampGain(relativeDb + 6);
  });
}
