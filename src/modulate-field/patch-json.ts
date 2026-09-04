import type {
  EnvelopeSettings,
  FrequencyMode,
  OperatorId,
  OperatorSettings,
  RoutingConnection,
  RoutingTarget,
  SynthPatch,
  Waveform,
} from "./types";

const operatorIds = [
  "op1",
  "op2",
  "op3",
  "op4",
] as const satisfies readonly OperatorId[];
const waveforms = [
  "sine",
  "square",
  "triangle",
  "sawtooth",
  "white",
] as const satisfies readonly Waveform[];
const frequencyModes = [
  "ratio",
  "fixed",
] as const satisfies readonly FrequencyMode[];

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(value: unknown, path: string): JsonObject {
  if (!isObject(value)) throw new Error(`${path} must be an object.`);
  return value;
}

function numberAt(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${path} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be a string.`);
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  path: string,
  options: readonly T[],
): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${path} must be one of: ${options.join(", ")}.`);
  }
  return value as T;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean")
    throw new Error(`${path} must be true or false.`);
  return value;
}

function parseEnvelope(value: unknown, path: string): EnvelopeSettings {
  const envelope = objectAt(value, path);
  if (envelope.segment1Time === undefined) {
    return {
      attack: numberAt(envelope.attack, `${path}.attack`, 0, 2),
      segment1Time: numberAt(envelope.decay, `${path}.decay`, 0.01, 3),
      segment1Level: numberAt(envelope.sustain, `${path}.sustain`, 0, 1),
      segment2Time: 0,
      segment2Level: numberAt(envelope.sustain, `${path}.sustain`, 0, 1),
      release: numberAt(envelope.release, `${path}.release`, 0, 5),
    };
  }
  return {
    attack: numberAt(envelope.attack, `${path}.attack`, 0, 2),
    segment1Time: numberAt(envelope.segment1Time, `${path}.segment1Time`, 0, 3),
    segment1Level: numberAt(
      envelope.segment1Level,
      `${path}.segment1Level`,
      0,
      1,
    ),
    segment2Time: numberAt(envelope.segment2Time, `${path}.segment2Time`, 0, 3),
    segment2Level: numberAt(
      envelope.segment2Level,
      `${path}.segment2Level`,
      0,
      1,
    ),
    release: numberAt(envelope.release, `${path}.release`, 0, 5),
  };
}

function parseOperator(value: unknown, index: number): OperatorSettings {
  const path = `operators[${index}]`;
  const operator = objectAt(value, path);
  return {
    enabled:
      operator.enabled === undefined
        ? true
        : booleanAt(operator.enabled, `${path}.enabled`),
    waveform: oneOf(operator.waveform, `${path}.waveform`, waveforms),
    frequencyMode: oneOf(
      operator.frequencyMode,
      `${path}.frequencyMode`,
      frequencyModes,
    ),
    ratio: numberAt(operator.ratio, `${path}.ratio`, 0.25, 8),
    fixedHz: numberAt(operator.fixedHz, `${path}.fixedHz`, 20, 2000),
    detune: numberAt(operator.detune, `${path}.detune`, -100, 100),
    level: numberAt(operator.level, `${path}.level`, 0, 1),
    modulationIndex: numberAt(
      operator.modulationIndex,
      `${path}.modulationIndex`,
      0,
      20,
    ),
    feedback: numberAt(operator.feedback, `${path}.feedback`, 0, 10),
    envelope: parseEnvelope(operator.envelope, `${path}.envelope`),
  };
}

function hasCycle(connections: RoutingConnection[]): boolean {
  const outgoing = new Map<OperatorId, OperatorId[]>(
    operatorIds.map((id) => [id, []]),
  );
  for (const { from, to } of connections) {
    if (to !== "output") outgoing.get(from)?.push(to);
  }

  const visiting = new Set<OperatorId>();
  const visited = new Set<OperatorId>();
  const visit = (operator: OperatorId): boolean => {
    if (visiting.has(operator)) return true;
    if (visited.has(operator)) return false;
    visiting.add(operator);
    for (const target of outgoing.get(operator) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(operator);
    visited.add(operator);
    return false;
  };

  return operatorIds.some(visit);
}

function parseConnections(value: unknown): RoutingConnection[] {
  if (!Array.isArray(value))
    throw new Error("routing.connections must be an array.");
  const seen = new Set<string>();
  const connections = value.map((connection, index) => {
    const path = `routing.connections[${index}]`;
    const entry = objectAt(connection, path);
    const from = oneOf(entry.from, `${path}.from`, operatorIds);
    const to = oneOf(entry.to, `${path}.to`, [
      ...operatorIds,
      "output",
    ] as const satisfies readonly RoutingTarget[]);
    const key = `${from}>${to}`;
    if (seen.has(key))
      throw new Error(`${path} duplicates the ${key} connection.`);
    seen.add(key);
    return { from, to };
  });

  if (hasCycle(connections))
    throw new Error("routing.connections must not contain a cycle.");
  return connections;
}

export function parsePatchJson(source: string): SynthPatch {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("PATCH JSON could not be parsed.");
  }

  const patch = objectAt(value, "PATCH JSON");
  if (patch.version !== 1) throw new Error("version must be 1.");
  if (!Array.isArray(patch.operators) || patch.operators.length !== 4) {
    throw new Error("operators must contain exactly four operators.");
  }

  const operators = patch.operators.map(parseOperator);
  return {
    version: 1,
    name: stringAt(patch.name, "name"),
    routing: {
      connections: parseConnections(
        objectAt(patch.routing, "routing").connections,
      ),
    },
    masterGain: numberAt(patch.masterGain, "masterGain", 0, 1),
    operators: operators as SynthPatch["operators"],
  };
}
