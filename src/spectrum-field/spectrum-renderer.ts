import { formatFrequency } from "../shared/format";
import type { SpectrumState } from "./state";
import { setupCanvas } from "./waveform-renderer";

const MAX_DB = -10;

export function renderSpectrum(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  peakReadout: HTMLElement,
  floor: number,
  state: SpectrumState,
  audio: HTMLAudioElement,
): void {
  const { width, height } = setupCanvas(canvas, context);
  const pad = { top: 22, right: 18, bottom: 34, left: 48 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  context.clearRect(0, 0, width, height);
  context.font = '8px "DM Mono"';
  context.lineWidth = 1;

  for (let db = -20; db >= floor; db -= 10) {
    const y = pad.top + ((MAX_DB - db) / (MAX_DB - floor)) * graphHeight;
    if (y > pad.top + graphHeight) continue;
    context.strokeStyle = "rgba(231,228,220,.09)";
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    context.fillStyle = "#696b63";
    context.textAlign = "right";
    context.fillText(`${db}`, pad.left - 8, y + 3);
  }

  const labels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  for (const frequency of labels) {
    const x = pad.left + (Math.log10(frequency / 20) / 3) * graphWidth;
    context.strokeStyle = "rgba(231,228,220,.07)";
    context.beginPath();
    context.moveTo(x, pad.top);
    context.lineTo(x, pad.top + graphHeight);
    context.stroke();
    context.fillStyle = "#74766d";
    context.textAlign =
      frequency === 20 ? "left" : frequency === 20000 ? "right" : "center";
    context.fillText(formatFrequency(frequency), x, height - 12);
  }
  context.fillStyle = "#54564f";
  context.textAlign = "left";
  context.fillText("dB", 14, pad.top + 3);
  context.textAlign = "right";
  context.fillText("Hz", width - pad.right, height - 12);

  const barCount = Math.max(36, Math.min(96, Math.floor(graphWidth / 11)));
  if (
    state.analyser &&
    (!state.frequencyData ||
      state.frequencyData.length !== state.analyser.frequencyBinCount)
  ) {
    state.frequencyData = new Float32Array(state.analyser.frequencyBinCount);
  }
  if (state.frequencyData && state.analyser) {
    state.analyser.getFloatFrequencyData(state.frequencyData);
  }
  if (state.peaks.length !== barCount) state.peaks = Array(barCount).fill(0);
  if (state.spectrumLevels.length !== barCount) {
    state.spectrumLevels = Array(barCount).fill(floor);
  }

  const sampleRate =
    state.context?.sampleRate ?? state.buffer?.sampleRate ?? 48000;
  const nyquist = sampleRate / 2;
  let globalPeak = -Infinity;
  const gap = 2;
  const barWidth = graphWidth / barCount;
  const analyzing = Boolean(state.analyser && !audio.paused && !audio.ended);
  for (let i = 0; i < barCount; i += 1) {
    const f0 = 20 * 1000 ** (i / barCount);
    const f1 = 20 * 1000 ** ((i + 1) / barCount);
    let db = state.hasSpectrum ? (state.spectrumLevels[i] ?? floor) : floor;
    if (state.frequencyData && analyzing) {
      db = floor;
      const first = Math.max(
        0,
        Math.floor((f0 / nyquist) * state.frequencyData.length),
      );
      const last = Math.min(
        state.frequencyData.length - 1,
        Math.ceil((f1 / nyquist) * state.frequencyData.length),
      );
      for (let bin = first; bin <= last; bin += 1) {
        db = Math.max(db, state.frequencyData[bin] ?? floor);
      }
      state.spectrumLevels[i] = db;
      state.hasSpectrum = true;
    }
    globalPeak = Math.max(globalPeak, db);
    const normalized = Math.max(
      0,
      Math.min(1, (db - floor) / (MAX_DB - floor)),
    );
    const barHeight = normalized * graphHeight;
    const x = pad.left + i * barWidth + gap / 2;
    const y = pad.top + graphHeight - barHeight;
    const gradient = context.createLinearGradient(
      0,
      pad.top + graphHeight,
      0,
      pad.top,
    );
    gradient.addColorStop(0, "#8da426");
    gradient.addColorStop(0.68, "#d8ff35");
    gradient.addColorStop(1, "#ff6b35");
    context.fillStyle = gradient;
    context.fillRect(x, y, Math.max(1, barWidth - gap), barHeight);
    if (analyzing)
      state.peaks[i] = Math.max(normalized, (state.peaks[i] ?? 0) - 0.006);
    const peakY = pad.top + graphHeight - (state.peaks[i] ?? 0) * graphHeight;
    context.fillStyle =
      (state.peaks[i] ?? 0) > 0.88 ? "#ff6b35" : "rgba(216,255,53,.65)";
    context.fillRect(x, peakY, Math.max(1, barWidth - gap), 1);
  }
  peakReadout.textContent =
    state.hasSpectrum && Number.isFinite(globalPeak)
      ? `${Math.round(globalPeak)} dB`
      : "−∞ dB";
}
