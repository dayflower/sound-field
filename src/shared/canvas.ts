export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export interface ResizeCanvasOptions {
  /** Caps costly backing stores while retaining crisp rendering. */
  readonly maxDpr?: number;
  /** Draw in CSS pixels instead of backing-store pixels. */
  readonly scaleContext?: boolean;
}

/** Keeps a canvas backing store in sync with its CSS size and device DPR. */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  { maxDpr = 2, scaleContext = true }: ResizeCanvasOptions = {},
): CanvasSize {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width * dpr));
  const height = Math.max(1, Math.round(bounds.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(
    scaleContext ? dpr : 1,
    0,
    0,
    scaleContext ? dpr : 1,
    0,
    0,
  );
  return { width: bounds.width, height: bounds.height, dpr };
}
