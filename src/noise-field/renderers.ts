import { resizeCanvas } from "../shared/canvas";
import { CURVE_SIZE, MAX_GAIN_DB, MIN_GAIN_DB } from "./spectrum-curve";
import type { NoiseState } from "./types";

export function drawCurve(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  curve: readonly number[],
): void {
  const { width, height } = resizeCanvas(canvas, context);
  const pad = { left: 36, right: 12, top: 14, bottom: 28 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const yForDb = (db: number): number =>
    pad.top + ((MAX_GAIN_DB - db) / (MAX_GAIN_DB - MIN_GAIN_DB)) * graphHeight;
  context.clearRect(0, 0, width, height);
  context.font = '8px "DM Mono"';
  for (const db of [-24, -12, 0, 12]) {
    const y = yForDb(db);
    context.strokeStyle = "rgba(20,21,16,.13)";
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    context.fillStyle = "#74756d";
    context.textAlign = "right";
    context.fillText(db > 0 ? `+${db}` : `${db}`, pad.left - 7, y + 3);
  }
  for (const frequency of [
    20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
  ]) {
    const x = pad.left + (Math.log10(frequency / 20) / 3) * graphWidth;
    context.strokeStyle = "rgba(20,21,16,.08)";
    context.beginPath();
    context.moveTo(x, pad.top);
    context.lineTo(x, pad.top + graphHeight);
    context.stroke();
    context.fillStyle = "#74756d";
    context.textAlign =
      frequency === 20 ? "left" : frequency === 20000 ? "right" : "center";
    context.fillText(
      frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`,
      x,
      height - 10,
    );
  }
  const points = curve.map((db, index) => ({
    x: pad.left + (index / (CURVE_SIZE - 1)) * graphWidth,
    y: yForDb(db),
  }));
  if (points.length === 0) return;
  context.beginPath();
  points.forEach((point, index) => {
    if (index) context.lineTo(point.x, point.y);
    else context.moveTo(point.x, point.y);
  });
  context.lineTo(
    points[points.length - 1]?.x ?? pad.left,
    pad.top + graphHeight,
  );
  context.lineTo(points[0]?.x ?? pad.left, pad.top + graphHeight);
  context.closePath();
  const fill = context.createLinearGradient(
    0,
    pad.top,
    0,
    pad.top + graphHeight,
  );
  fill.addColorStop(0, "rgba(216,255,53,.42)");
  fill.addColorStop(1, "rgba(216,255,53,.04)");
  context.fillStyle = fill;
  context.fill();
  context.beginPath();
  points.forEach((point, index) => {
    if (index) context.lineTo(point.x, point.y);
    else context.moveTo(point.x, point.y);
  });
  context.strokeStyle = "#141510";
  context.lineWidth = 1.5;
  context.stroke();
}

export function drawLiveSpectrum(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  state: NoiseState,
): void {
  const { width, height } = resizeCanvas(canvas, context);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(231,228,220,.08)";
  context.lineWidth = 1;
  for (let index = 1; index < 8; index += 1) {
    const x = (width / 8) * index;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let index = 1; index < 4; index += 1) {
    const y = (height / 4) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.beginPath();
  context.strokeStyle = "#d8ff35";
  context.lineWidth = 1.5;
  if (state.audio && state.playing) {
    const data = new Uint8Array(state.audio.analyser.frequencyBinCount);
    state.audio.analyser.getByteFrequencyData(data);
    for (let x = 0; x < width; x += 2) {
      const frequency = 20 * 1000 ** (x / width);
      const bin = Math.min(
        data.length - 1,
        Math.round(
          (frequency / (state.audio.context.sampleRate / 2)) * data.length,
        ),
      );
      const y = height - ((data[bin] ?? 0) / 255) * height * 0.92;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  } else {
    state.curve.forEach((level, index) => {
      const x = (index / Math.max(1, state.curve.length - 1)) * width;
      const y =
        height -
        ((level - MIN_GAIN_DB) / (MAX_GAIN_DB - MIN_GAIN_DB)) * height * 0.72 -
        height * 0.12;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
  }
  context.stroke();
}
