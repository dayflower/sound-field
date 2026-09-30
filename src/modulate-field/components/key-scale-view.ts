// Draws the level scaling curve of an operator over the MIDI note range.
import { keyScaledLevel, type OperatorParams } from "../core/patch";
import { COLORS, prepareCanvas } from "./canvas";
import { noteName } from "./keyboard";

const NOTE_MIN = 21;
const NOTE_MAX = 108;
const DB_TOP = 12;
const DB_BOTTOM = -48;
const PAD = { left: 6, right: 6, top: 6, bottom: 14 };

export class KeyScaleView {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getOperator: () => OperatorParams,
    private readonly color: string,
  ) {}

  draw(): void {
    const { ctx, w, h } = prepareCanvas(this.canvas);
    const op = this.getOperator();
    const innerW = w - PAD.left - PAD.right;
    const innerH = h - PAD.top - PAD.bottom;
    const xOf = (note: number) =>
      PAD.left + ((note - NOTE_MIN) / (NOTE_MAX - NOTE_MIN)) * innerW;
    const yOf = (db: number) => {
      const clamped = Math.min(Math.max(db, DB_BOTTOM), DB_TOP);
      return PAD.top + ((DB_TOP - clamped) / (DB_TOP - DB_BOTTOM)) * innerH;
    };
    // Gain relative to the unscaled level, so that the clamp of boosts at full level is visible
    // (a silent operator is drawn as if at full level).
    const ref = op.level > 0 ? op : { ...op, level: 1 };
    const gainDb = (note: number) =>
      20 * Math.log10(keyScaledLevel(ref, note) / ref.level);

    // Octave grid (every C) and the 0 dB line.
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = COLORS.gridLabel;
    ctx.textAlign = "center";
    ctx.beginPath();
    for (let note = 24; note <= NOTE_MAX; note += 12) {
      const x = Math.round(xOf(note)) + 0.5;
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, h - PAD.bottom);
      ctx.fillText(noteName(note), x, h - 3);
    }
    const y0 = Math.round(yOf(0)) + 0.5;
    ctx.moveTo(PAD.left, y0);
    ctx.lineTo(w - PAD.right, y0);
    ctx.stroke();

    // Break point.
    const xb = Math.round(xOf(op.keyScale.breakPoint)) + 0.5;
    ctx.strokeStyle = COLORS.gridLabel;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xb, PAD.top);
    ctx.lineTo(xb, h - PAD.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Level curve.
    ctx.beginPath();
    for (let note = NOTE_MIN; note <= NOTE_MAX; note++) {
      const x = xOf(note);
      const y = yOf(gainDb(note));
      if (note === NOTE_MIN) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.gridLabel;
    ctx.fillText(`+${DB_TOP}dB`, w - PAD.right, PAD.top + 8);
  }
}
