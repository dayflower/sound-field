// Small SVG diagram of an operator routing (100 x 48 view box), ported from noisegen's MODULATE / FIELD.
import { OPERATOR_IDS, type OperatorId, type Routing } from "../core/patch";

type Layout = Record<OperatorId, readonly [number, number]>;

/** Lays operators out in columns by their depth in the modulation graph. */
export function automaticLayout(routing: Routing): Layout {
  const incoming = new Map<OperatorId, number>(
    OPERATOR_IDS.map((id) => [id, 0]),
  );
  const outgoing = new Map<OperatorId, OperatorId[]>(
    OPERATOR_IDS.map((id) => [id, []]),
  );
  for (const { from, to } of routing.connections) {
    if (to === "output") continue;
    incoming.set(to, incoming.get(to)! + 1);
    outgoing.get(from)!.push(to);
  }

  const levels = new Map<OperatorId, number>(OPERATOR_IDS.map((id) => [id, 0]));
  const queue = OPERATOR_IDS.filter((id) => incoming.get(id) === 0);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]!;
    for (const target of outgoing.get(id)!) {
      levels.set(target, Math.max(levels.get(target)!, levels.get(id)! + 1));
      const remaining = incoming.get(target)! - 1;
      incoming.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  const maxLevel = Math.max(...levels.values());
  const layout = {} as Record<OperatorId, readonly [number, number]>;
  for (let level = 0; level <= maxLevel; level++) {
    const column = OPERATOR_IDS.filter((id) => levels.get(id) === level);
    column.forEach((id, i) => {
      const x = maxLevel === 0 ? 42 : 12 + (level / maxLevel) * 68;
      layout[id] = [x, (48 * (i + 1)) / (column.length + 1)];
    });
  }
  return layout;
}

/** Returns SVG markup; operators are drawn as numbered squares, outputs as arrows to the right edge. */
export function routingDiagram(
  routing: Routing,
  layout: Layout = automaticLayout(routing),
): string {
  const edges = routing.connections
    .map(({ from, to }) => {
      const [sx, sy] = layout[from];
      if (to === "output") {
        return `<line class="out" x1="${sx + 5}" y1="${sy}" x2="92" y2="${sy}" /><path class="arrow" d="M 96 ${sy} L 91 ${sy - 2.5} L 91 ${sy + 2.5} Z" />`;
      }
      const [tx, ty] = layout[to];
      const startX = sx + 5;
      const endX = tx - 5;
      const midX = (startX + endX) / 2;
      return sy === ty
        ? `<path d="M ${startX} ${sy} H ${endX}" />`
        : `<path d="M ${startX} ${sy} H ${midX} V ${ty} H ${endX}" />`;
    })
    .join("");
  const nodes = OPERATOR_IDS.map((id, i) => {
    const [x, y] = layout[id];
    return `<g class="node op${i + 1}" transform="translate(${x} ${y})"><rect x="-5" y="-5" width="10" height="10" /><text y="2.2">${i + 1}</text></g>`;
  }).join("");
  return `<svg class="routing-diagram" viewBox="0 0 100 48" aria-hidden="true"><g class="edges">${edges}</g>${nodes}</svg>`;
}
