export const COLORS = {
  bg: "#0b0f14",
  grid: "#1c2733",
  gridLabel: "#4a5a6a",
  accent: "#d8ff35",
  accentDim: "rgba(216, 255, 53, 0.18)",
  secondary: "#5ad1e6",
  secondaryDim: "rgba(90, 209, 230, 0.18)",
  text: "#c9d4df",
} as const;

/** Per-operator colors (OP1 - OP4). */
export const OP_COLORS = ["#5ad1e6", "#8fd46b", "#c79bf2", "#ffb347"] as const;

/**
 * Resizes the canvas backing store to match its CSS size and device pixel ratio,
 * and returns a context whose coordinates are in CSS pixels.
 */
export function prepareCanvas(canvas: HTMLCanvasElement): {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
} {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);
  return { ctx, w, h };
}
