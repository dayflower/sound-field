import { fft } from "./fft";
import { sampleCurveAt } from "./spectrum-curve";

export const FIR_SIZE = 2048;

export function createImpulseResponse(
  context: BaseAudioContext,
  curve: readonly number[],
): AudioBuffer {
  const real = new Float64Array(FIR_SIZE);
  const imaginary = new Float64Array(FIR_SIZE);
  for (let bin = 0; bin <= FIR_SIZE / 2; bin += 1) {
    const frequency = (bin * context.sampleRate) / FIR_SIZE;
    const db = sampleCurveAt(Math.max(20, Math.min(20000, frequency)), curve);
    const magnitude = 10 ** (db / 20);
    real[bin] = magnitude;
    if (bin > 0 && bin < FIR_SIZE / 2) real[FIR_SIZE - bin] = magnitude;
  }
  fft(real, imaginary, true);
  const buffer = context.createBuffer(1, FIR_SIZE, context.sampleRate);
  const impulse = buffer.getChannelData(0);
  for (let index = 0; index < FIR_SIZE; index += 1) {
    const shifted = real[(index + FIR_SIZE / 2) % FIR_SIZE] ?? 0;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FIR_SIZE - 1));
    impulse[index] = shifted * window;
  }
  return buffer;
}
