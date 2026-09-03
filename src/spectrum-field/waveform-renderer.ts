import { resizeCanvas } from "../shared/canvas";

export { resizeCanvas as setupCanvas };

export function renderWaveform(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  buffer: AudioBuffer | null,
  audio: HTMLAudioElement,
): void {
  const { width, height } = resizeCanvas(canvas, context);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(231,228,220,.06)";
  context.fillRect(0, 0, width, height);
  if (!buffer) return;

  const channel = buffer.getChannelData(0);
  const progress = audio.duration ? audio.currentTime / audio.duration : 0;
  const samples = Math.max(1, Math.floor(width));
  const block = Math.max(1, Math.floor(channel.length / samples));
  for (let x = 0; x < samples; x += 1) {
    let peak = 0;
    const start = x * block;
    for (let j = 0; j < block; j += Math.max(1, Math.floor(block / 24))) {
      peak = Math.max(peak, Math.abs(channel[start + j] ?? 0));
    }
    const barHeight = Math.max(1, peak * height * 0.9);
    context.fillStyle =
      x / samples <= progress ? "#d8ff35" : "rgba(231,228,220,.28)";
    context.fillRect(x, (height - barHeight) / 2, 1, barHeight);
  }
  const playX = progress * width;
  context.fillStyle = "#e7e4dc";
  context.fillRect(playX, 0, 1, height);
}
