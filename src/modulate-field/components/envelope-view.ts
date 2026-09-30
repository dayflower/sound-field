// Draws the segment envelope shape and a live marker for the most recently played voice.
import { type EnvelopeParams, type EnvSnapshot, EnvStage } from "../core/patch";
import { COLORS, prepareCanvas } from "./canvas";
import { parseWithUnits } from "./slider";

const SUSTAIN_WIDTH_RATIO = 0.18;
const PAD = { left: 6, right: 6, top: 14, bottom: 14 };

export class EnvelopeView {
  private live: EnvSnapshot | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getParams: () => EnvelopeParams,
    private readonly color: string,
  ) {}

  setLive(snapshot: EnvSnapshot): void {
    this.live = snapshot;
  }

  draw(): void {
    const { ctx, w, h } = prepareCanvas(this.canvas);
    const p = this.getParams();

    const innerW = w - PAD.left - PAD.right;
    const innerH = h - PAD.top - PAD.bottom;
    const sustainW = innerW * SUSTAIN_WIDTH_RATIO;
    const total = p.attack + p.d1 + p.d2 + p.release;
    const pxPerSec = total > 0 ? (innerW - sustainW) / total : 0;

    const xA = PAD.left + p.attack * pxPerSec;
    const x1 = xA + p.d1 * pxPerSec;
    const x2 = x1 + p.d2 * pxPerSec;
    const xS = x2 + sustainW;
    const xR = xS + p.release * pxPerSec;
    const yOf = (level: number) => PAD.top + (1 - level) * innerH;

    // Grid and segment boundaries.
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (const lv of [0, 0.5, 1]) {
      const y = Math.round(yOf(lv)) + 0.5;
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
    }
    for (const x of [xA, x1, x2, xS]) {
      ctx.moveTo(Math.round(x) + 0.5, PAD.top);
      ctx.lineTo(Math.round(x) + 0.5, h - PAD.bottom);
    }
    ctx.stroke();

    // Sustain region shading.
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    ctx.fillRect(x2, PAD.top, sustainW, innerH);

    // Envelope shape.
    ctx.beginPath();
    ctx.moveTo(PAD.left, yOf(0));
    ctx.lineTo(xA, yOf(1));
    ctx.lineTo(x1, yOf(p.l1));
    ctx.lineTo(x2, yOf(p.l2));
    ctx.lineTo(xS, yOf(p.l2));
    ctx.lineTo(xR, yOf(0));
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(PAD.left, yOf(0));
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Segment labels.
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = COLORS.gridLabel;
    ctx.textAlign = "center";
    for (const [index, text] of ["A", "D1", "D2", "S", "R"].entries()) {
      ctx.fillText(text, PAD.left + ((index + 0.5) * innerW) / 5, h - 3);
    }
    ctx.textAlign = "right";
    ctx.fillText(`${formatTime(total)} + S`, w - PAD.right, 10);
    ctx.textAlign = "left";

    // Live position of the most recent voice.
    const live = this.live;
    if (!live || live.stage === EnvStage.Idle) return;
    let x: number;
    switch (live.stage) {
      case EnvStage.Attack:
        x = PAD.left + Math.min(live.time, p.attack) * pxPerSec;
        break;
      case EnvStage.Seg1:
        x = xA + Math.min(live.time, p.d1) * pxPerSec;
        break;
      case EnvStage.Seg2:
        x = x1 + Math.min(live.time, p.d2) * pxPerSec;
        break;
      case EnvStage.Sustain:
        x = x2 + sustainW / 2;
        break;
      case EnvStage.Release:
        x = xS + Math.min(live.time, p.release) * pxPerSec;
        break;
    }
    const y = yOf(live.level);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export function formatTime(sec: number): string {
  if (sec >= 1) return `${sec.toFixed(2)}s`;
  const ms = sec * 1000;
  return `${Number(ms.toFixed(ms < 10 ? 2 : ms < 100 ? 1 : 0))}ms`;
}

/** Parses "12ms", "0.5s" or a bare number (milliseconds) into seconds. */
export function parseTime(text: string): number | null {
  return parseWithUnits(text, { ms: 0.001, s: 1 }, 0.001);
}
