import { CURVE_SIZE } from "./spectrum-curve";

const padding = { left: 36, right: 12, top: 14, bottom: 28 };

export interface CurvePoint {
  index: number;
  value: number;
}

export function curvePointFromPointer(
  canvas: HTMLCanvasElement,
  event: PointerEvent,
): CurvePoint {
  const rect = canvas.getBoundingClientRect();
  const xRatio = Math.max(
    0,
    Math.min(
      1,
      (event.clientX - rect.left - padding.left) /
        (rect.width - padding.left - padding.right),
    ),
  );
  const yRatio = Math.max(
    0,
    Math.min(
      1,
      (event.clientY - rect.top - padding.top) /
        (rect.height - padding.top - padding.bottom),
    ),
  );
  return {
    index: Math.round(xRatio * (CURVE_SIZE - 1)),
    value: 12 - yRatio * 36,
  };
}

export function editCurve(
  curve: readonly number[],
  previousIndex: number | null,
  next: CurvePoint,
): number[] {
  const result = [...curve];
  const from = previousIndex ?? next.index;
  const previousValue = result[from] ?? next.value;
  const start = Math.min(from, next.index);
  const end = Math.max(from, next.index);
  for (let index = start; index <= end; index += 1) {
    const ratio =
      start === end ? 1 : Math.abs(index - from) / Math.abs(next.index - from);
    result[index] = previousValue + (next.value - previousValue) * ratio;
  }
  return result;
}
