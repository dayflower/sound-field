import { describe, expect, it } from "vitest";

import {
  AudioAnalysisError,
  analyzeAudioBuffer,
} from "../src/noise-field/audio-analysis";
import { fft } from "../src/noise-field/fft";
import {
  bandsToCurve,
  CURVE_SIZE,
  curveFrequency,
  curveToBands,
  MAX_FREQUENCY,
  MIN_FREQUENCY,
  smoothCurveValues,
} from "../src/noise-field/spectrum-curve";
import { formatBytes, formatFrequency, formatTime } from "../src/shared/format";

const pinkLevels = [12, 9, 6, 3, 0, -3, -6, -9, -12, -15];

describe("NOISE / FIELD spectrum curve", () => {
  it("spans 20 Hz to 20 kHz", () => {
    expect(curveFrequency(0)).toBe(MIN_FREQUENCY);
    expect(curveFrequency(CURVE_SIZE - 1)).toBe(MAX_FREQUENCY);
  });

  it("keeps the default preset within the supported gain range", () => {
    const curve = bandsToCurve(pinkLevels);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-24);
    expect(Math.max(...curve)).toBeLessThanOrEqual(12);
  });

  it("round-trips the default bands through the detailed curve", () => {
    const result = curveToBands(bandsToCurve(pinkLevels));
    for (const [index, value] of pinkLevels.entries()) {
      expect(result[index]).toBeCloseTo(value, 0);
    }
  });

  it("smooths without changing endpoints or length", () => {
    const source = [12, -24, 6, -12, 0];
    const result = smoothCurveValues(source, 4);
    expect(result).toHaveLength(source.length);
    expect(result[0]).toBe(source[0]);
    expect(result.at(-1)).toBe(source.at(-1));
  });
});

describe("NOISE / FIELD FFT and audio analysis", () => {
  it("reconstructs a signal after inverse FFT", () => {
    const expected = [0.25, -1, 0.5, 0.75, -0.5, 0, 1, -0.25];
    const real = new Float64Array(expected);
    const imaginary = new Float64Array(real.length);
    fft(real, imaginary);
    fft(real, imaginary, true);
    for (const [index, value] of expected.entries()) {
      expect(real[index]).toBeCloseTo(value, 12);
      expect(imaginary[index]).toBeCloseTo(0, 12);
    }
  });

  it("reports short, silent, and invalid audio analysis inputs", () => {
    const silent = {
      length: 64,
      numberOfChannels: 1,
      sampleRate: 48000,
      getChannelData: () => new Float32Array(64),
    };
    expect(() => analyzeAudioBuffer({ ...silent, length: 63 }, "mean")).toThrow(
      new AudioAnalysisError("too-short"),
    );
    expect(() => analyzeAudioBuffer(silent, "mean")).toThrow(
      new AudioAnalysisError("no-signal"),
    );
    expect(() => analyzeAudioBuffer(silent, "total")).toThrow(
      new AudioAnalysisError("invalid-mode"),
    );
  });
});

describe("shared formatting", () => {
  it("formats time boundaries", () => {
    expect(formatTime(Number.NaN)).toBe("00:00");
    expect(formatTime(-1)).toBe("0:00");
    expect(formatTime(59.9)).toBe("0:59");
    expect(formatTime(3600)).toBe("1:00:00");
  });

  it("formats byte and frequency boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
    expect(formatFrequency(999)).toBe("999");
    expect(formatFrequency(1000)).toBe("1k");
    expect(formatFrequency(20000, "hertz")).toBe("20.0 kHz");
  });
});
