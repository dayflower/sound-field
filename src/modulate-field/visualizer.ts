import type { ModulateSynth } from "./audio";
import { resizeCanvas } from "../shared/canvas";

function canvasContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D | null {
  const context = canvas.getContext("2d");
  if (context) {
    resizeCanvas(canvas, context, {
      maxDpr: Number.POSITIVE_INFINITY,
      scaleContext: false,
    });
  }
  return context;
}

function prepareCanvas(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(231, 228, 220, 0.12)";
  context.lineWidth = 1;
  context.beginPath();
  for (let index = 1; index < 4; index += 1) {
    const x = (canvas.width / 4) * index;
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
  }
  for (let index = 1; index < 3; index += 1) {
    const y = (canvas.height / 3) * index;
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
  }
  context.stroke();
}

export function startVisualizers(
  synth: ModulateSynth,
  scopeCanvas: HTMLCanvasElement,
  spectrumCanvas: HTMLCanvasElement,
): () => void {
  let frame = 0;

  const draw = () => {
    const scopeContext = canvasContext(scopeCanvas);
    const spectrumContext = canvasContext(spectrumCanvas);
    if (scopeContext) {
      prepareCanvas(scopeContext, scopeCanvas);
      const values = synth.waveform.getValue();
      scopeContext.strokeStyle = "#d8ff35";
      scopeContext.shadowColor = "rgba(216, 255, 53, 0.45)";
      scopeContext.shadowBlur = 8;
      scopeContext.lineWidth = Math.max(1.5, window.devicePixelRatio);
      scopeContext.beginPath();
      values.forEach((rawValue, index) => {
        const value = Array.isArray(rawValue) ? (rawValue[0] ?? 0) : rawValue;
        const x = (index / (values.length - 1)) * scopeCanvas.width;
        const y = (0.5 - value * 0.42) * scopeCanvas.height;
        if (index === 0) scopeContext.moveTo(x, y);
        else scopeContext.lineTo(x, y);
      });
      scopeContext.stroke();
      scopeContext.shadowBlur = 0;
    }

    if (spectrumContext) {
      prepareCanvas(spectrumContext, spectrumCanvas);
      const values = synth.fft.getValue();
      const barWidth = spectrumCanvas.width / values.length;
      spectrumContext.fillStyle = "rgba(255, 107, 53, 0.82)";
      values.forEach((rawValue, index) => {
        const decibels = Array.isArray(rawValue)
          ? (rawValue[0] ?? -Infinity)
          : rawValue;
        const displayLevel = Math.min(1, Math.max(0, (decibels + 90) / 78));
        const height = displayLevel * spectrumCanvas.height * 0.92;
        if (height < 1) return;
        spectrumContext.fillRect(
          index * barWidth,
          spectrumCanvas.height - height,
          Math.max(1, barWidth - 1),
          height,
        );
      });
    }
    frame = window.requestAnimationFrame(draw);
  };

  draw();
  return () => window.cancelAnimationFrame(frame);
}
