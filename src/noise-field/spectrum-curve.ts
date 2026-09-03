export const BAND_FREQUENCIES = [
  31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const CURVE_SIZE = 128;
export const MIN_FREQUENCY = 20;
export const MAX_FREQUENCY = 20000;
export const MIN_GAIN_DB = -24;
export const MAX_GAIN_DB = 12;

function valueAt(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined)
    throw new RangeError("Index is outside the value range.");
  return value;
}

export function curveFrequency(index: number, curveSize = CURVE_SIZE): number {
  return MIN_FREQUENCY * 1000 ** (index / (curveSize - 1));
}

export function interpolateLogPoints(
  frequency: number,
  frequencies: readonly number[],
  values: readonly number[],
): number {
  if (frequencies.length === 0 || frequencies.length !== values.length) {
    throw new RangeError(
      "Frequencies and values must be non-empty and equal in length.",
    );
  }

  const firstFrequency = valueAt(frequencies, 0);
  const lastIndex = frequencies.length - 1;
  const lastFrequency = valueAt(frequencies, lastIndex);
  if (frequency <= firstFrequency) return valueAt(values, 0);
  if (frequency >= lastFrequency) return valueAt(values, lastIndex);

  const target = Math.log(frequency);
  let upper = 1;
  while (upper < frequencies.length && valueAt(frequencies, upper) < frequency)
    upper++;
  const lower = upper - 1;
  const lowerFrequency = valueAt(frequencies, lower);
  const upperFrequency = valueAt(frequencies, upper);
  const lowerValue = valueAt(values, lower);
  const upperValue = valueAt(values, upper);
  const ratio =
    (target - Math.log(lowerFrequency)) /
    (Math.log(upperFrequency) - Math.log(lowerFrequency));
  return lowerValue + (upperValue - lowerValue) * ratio;
}

export function bandsToCurve(
  levels: readonly number[],
  frequencies: readonly number[] = BAND_FREQUENCIES,
  curveSize = CURVE_SIZE,
): number[] {
  return Array.from({ length: curveSize }, (_, index) =>
    interpolateLogPoints(curveFrequency(index, curveSize), frequencies, levels),
  );
}

export function sampleCurveAt(
  frequency: number,
  curve: readonly number[],
): number {
  if (curve.length === 0) throw new RangeError("Curve must not be empty.");
  if (curve.length === 1) return valueAt(curve, 0);

  const position =
    (Math.log10(frequency / MIN_FREQUENCY) / 3) * (curve.length - 1);
  const lower = Math.max(0, Math.min(curve.length - 1, Math.floor(position)));
  const upper = Math.min(curve.length - 1, lower + 1);
  const ratio = position - lower;
  const lowerValue = valueAt(curve, lower);
  return lowerValue + (valueAt(curve, upper) - lowerValue) * ratio;
}

export function clampGain(value: number): number {
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, value));
}

export function curveToBands(
  curve: readonly number[],
  frequencies: readonly number[] = BAND_FREQUENCIES,
): number[] {
  return frequencies.map((frequency) =>
    Math.round(clampGain(sampleCurveAt(frequency, curve))),
  );
}

export function smoothCurveValues(
  values: readonly number[],
  passes = 1,
): number[] {
  let result = [...values];
  for (let pass = 0; pass < passes; pass++) {
    const source = result;
    result = source.map((value, index) => {
      if (index === 0 || index === source.length - 1) return value;
      return (
        valueAt(source, index - 1) * 0.25 +
        value * 0.5 +
        valueAt(source, index + 1) * 0.25
      );
    });
  }
  return result;
}

export function clampCurve(curve: readonly number[]): number[] {
  return curve.map(clampGain);
}
