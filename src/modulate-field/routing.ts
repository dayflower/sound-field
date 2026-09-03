import type { OperatorId, OperatorRouting, RoutingPreset } from "./types";

export const routingPresets: ReadonlyArray<RoutingPreset> = [
  {
    id: 0,
    label: "SERIAL",
    formula: "1›2›3›4",
    routing: {
      connections: [
        { from: "op1", to: "op2" },
        { from: "op2", to: "op3" },
        { from: "op3", to: "op4" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [12, 24], op2: [36, 24], op3: [60, 24], op4: [84, 24] },
  },
  {
    id: 1,
    label: "MERGE",
    formula: "1+2›3›4",
    routing: {
      connections: [
        { from: "op1", to: "op3" },
        { from: "op2", to: "op3" },
        { from: "op3", to: "op4" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [12, 12], op2: [12, 36], op3: [50, 24], op4: [84, 24] },
  },
  {
    id: 2,
    label: "SPLIT",
    formula: "1+(2›3)›4",
    routing: {
      connections: [
        { from: "op1", to: "op4" },
        { from: "op2", to: "op3" },
        { from: "op3", to: "op4" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [12, 12], op2: [12, 36], op3: [48, 36], op4: [84, 12] },
  },
  {
    id: 3,
    label: "DIAMOND",
    formula: "1›(2·3)›4",
    routing: {
      connections: [
        { from: "op1", to: "op2" },
        { from: "op1", to: "op3" },
        { from: "op2", to: "op4" },
        { from: "op3", to: "op4" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [12, 24], op2: [48, 12], op3: [48, 36], op4: [84, 24] },
  },
  {
    id: 4,
    label: "DOUBLE",
    formula: "1›2 + 3›4",
    routing: {
      connections: [
        { from: "op1", to: "op2" },
        { from: "op3", to: "op4" },
        { from: "op2", to: "output" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [12, 12], op2: [76, 12], op3: [12, 36], op4: [76, 36] },
  },
  {
    id: 5,
    label: "FAN",
    formula: "1›2·3·4",
    routing: {
      connections: [
        { from: "op1", to: "op2" },
        { from: "op1", to: "op3" },
        { from: "op1", to: "op4" },
        { from: "op2", to: "output" },
        { from: "op3", to: "output" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [12, 24], op2: [76, 8], op3: [76, 24], op4: [76, 40] },
  },
  {
    id: 6,
    label: "PAIR",
    formula: "1›2 + 3 + 4",
    routing: {
      connections: [
        { from: "op1", to: "op2" },
        { from: "op2", to: "output" },
        { from: "op3", to: "output" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [12, 8], op2: [76, 8], op3: [76, 24], op4: [76, 40] },
  },
  {
    id: 7,
    label: "ADDITIVE",
    formula: "1 + 2 + 3 + 4",
    routing: {
      connections: [
        { from: "op1", to: "output" },
        { from: "op2", to: "output" },
        { from: "op3", to: "output" },
        { from: "op4", to: "output" },
      ],
    },
    diagram: { op1: [76, 7], op2: [76, 18], op3: [76, 30], op4: [76, 41] },
  },
];

export function getRoutingPreset(id: number): RoutingPreset {
  return routingPresets[id] ?? (routingPresets[0] as RoutingPreset);
}

export function operatorIndex(operatorId: OperatorId): number {
  return Number(operatorId.slice(2)) - 1;
}

export function routingMatches(
  left: OperatorRouting,
  right: OperatorRouting,
): boolean {
  const connectionKey = (routing: OperatorRouting) =>
    routing.connections
      .map(({ from, to }) => `${from}>${to}`)
      .sort()
      .join("|");
  return connectionKey(left) === connectionKey(right);
}
