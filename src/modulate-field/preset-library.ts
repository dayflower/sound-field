import { defaultPatch } from "./patch";
import { parsePatchJson } from "./patch-json";
import type { EnvelopeSettings, OperatorSettings, SynthPatch } from "./types";

export type PresetKind = "patch" | "operator" | "parameters" | "envelope";

export type OperatorParameters = Omit<OperatorSettings, "envelope">;

export type PresetValueByKind = {
  patch: SynthPatch;
  operator: OperatorSettings;
  parameters: OperatorParameters;
  envelope: EnvelopeSettings;
};

export interface SavedPreset<T> {
  id: string;
  name: string;
  value: T;
}

type PresetStore = { version: 1 } & {
  [K in PresetKind]: SavedPreset<PresetValueByKind[K]>[];
};

const storageKey = "sound-field-modulate-presets";
const maximumPresetNameLength = 60;
let memoryStore: PresetStore | undefined;

function emptyStore(): PresetStore {
  return {
    version: 1,
    patch: [],
    operator: [],
    parameters: [],
    envelope: [],
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parsePatch(value: unknown): SynthPatch | undefined {
  try {
    return parsePatchJson(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function parseOperator(value: unknown): OperatorSettings | undefined {
  const candidate = structuredClone(defaultPatch);
  candidate.operators[0] = value as OperatorSettings;
  return parsePatch(candidate)?.operators[0];
}

function parseParameters(value: unknown): OperatorParameters | undefined {
  const input = objectValue(value);
  if (!input) return undefined;
  const candidate = structuredClone(defaultPatch);
  const operator = candidate.operators[0];
  const keys: (keyof OperatorParameters)[] = [
    "enabled",
    "waveform",
    "frequencyMode",
    "ratio",
    "fixedHz",
    "detune",
    "level",
    "feedback",
  ];
  for (const key of keys) operator[key] = input[key] as never;
  const parsed = parsePatch(candidate)?.operators[0];
  if (!parsed) return undefined;
  const { envelope: _envelope, ...parameters } = parsed;
  return parameters;
}

function parseEnvelope(value: unknown): EnvelopeSettings | undefined {
  const input = objectValue(value);
  if (!input) return undefined;
  const candidate = structuredClone(defaultPatch);
  candidate.operators[0].envelope = input as unknown as EnvelopeSettings;
  return parsePatch(candidate)?.operators[0].envelope;
}

function parseValue<K extends PresetKind>(
  kind: K,
  value: unknown,
): PresetValueByKind[K] | undefined {
  const parsers = {
    patch: parsePatch,
    operator: parseOperator,
    parameters: parseParameters,
    envelope: parseEnvelope,
  } as const;
  return parsers[kind](value) as PresetValueByKind[K] | undefined;
}

function parseEntries<K extends PresetKind>(
  kind: K,
  value: unknown,
): SavedPreset<PresetValueByKind[K]>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const candidate = objectValue(entry);
    if (!candidate || typeof candidate.id !== "string") return [];
    const name = normalizeName(candidate.name);
    const parsed = parseValue(kind, candidate.value);
    return name && parsed ? [{ id: candidate.id, name, value: parsed }] : [];
  });
}

function parseStore(value: unknown): PresetStore | undefined {
  const candidate = objectValue(value);
  if (candidate?.version !== 1) return undefined;
  return {
    version: 1,
    patch: parseEntries("patch", candidate.patch),
    operator: parseEntries("operator", candidate.operator),
    parameters: parseEntries("parameters", candidate.parameters),
    envelope: parseEntries("envelope", candidate.envelope),
  };
}

function readStore(): PresetStore {
  if (memoryStore) return memoryStore;
  try {
    const stored = localStorage.getItem(storageKey);
    memoryStore = stored
      ? (parseStore(JSON.parse(stored)) ?? emptyStore())
      : emptyStore();
  } catch {
    memoryStore = emptyStore();
  }
  return memoryStore;
}

function persist(store: PresetStore): void {
  memoryStore = store;
  try {
    localStorage.setItem(storageKey, JSON.stringify(store));
  } catch {
    /* Keep presets available for the current session when storage is unavailable. */
  }
}

function normalizeName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim().slice(0, maximumPresetNameLength);
  return name || undefined;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPresetLibrary() {
  return {
    list<K extends PresetKind>(
      kind: K,
    ): readonly SavedPreset<PresetValueByKind[K]>[] {
      return structuredClone(readStore()[kind]) as SavedPreset<
        PresetValueByKind[K]
      >[];
    },
    save<K extends PresetKind>(
      kind: K,
      name: string,
      value: PresetValueByKind[K],
    ): boolean {
      const normalizedName = normalizeName(name);
      const normalizedValue = parseValue(kind, value);
      if (!normalizedName || !normalizedValue) return false;
      const store = readStore();
      if (
        store[kind].some(
          (entry) =>
            entry.name.localeCompare(normalizedName, undefined, {
              sensitivity: "accent",
            }) === 0,
        )
      )
        return false;
      const entries = store[kind] as SavedPreset<PresetValueByKind[K]>[];
      entries.unshift({
        id: newId(),
        name: normalizedName,
        value: structuredClone(normalizedValue),
      });
      persist(store);
      return true;
    },
    remove(kind: PresetKind, id: string): void {
      const store = readStore();
      store[kind] = store[kind].filter((entry) => entry.id !== id) as never;
      persist(store);
    },
  };
}
