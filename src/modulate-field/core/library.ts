// Named user libraries persisted in localStorage (one key per category).
import {
  type EnvelopeParams,
  type KeyScaleParams,
  type LfoParams,
  normalizeEnvelope,
  normalizeKeyScale,
  normalizeLfo,
  normalizeOperator,
  normalizeOscillator,
  normalizePatch,
  type OperatorParams,
  type OscillatorParams,
  type Patch,
} from "./patch";

export class Library<T> extends EventTarget {
  private fallback: Record<string, unknown> | null = null;
  constructor(
    private readonly storageKey: string,
    private readonly normalize: (v: unknown) => T,
  ) {
    super();
    // Keep controls in sync when another tab edits the same library.
    window.addEventListener("storage", (e) => {
      if (e.key === this.storageKey) this.dispatchEvent(new Event("change"));
    });
  }

  names(): string[] {
    return Object.keys(this.read()).sort((a, b) => a.localeCompare(b));
  }

  has(name: string): boolean {
    return name in this.read();
  }

  get(name: string): T | undefined {
    const entries = this.read();
    return name in entries ? this.normalize(entries[name]) : undefined;
  }

  save(name: string, value: T): void {
    this.write({ ...this.read(), [name]: value });
  }

  remove(name: string): void {
    const entries = this.read();
    delete entries[name];
    this.write(entries);
  }

  private read(): Record<string, unknown> {
    if (this.fallback) return this.fallback;
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(this.storageKey) ?? "{}",
      );
      return typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private write(entries: Record<string, unknown>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(entries));
    } catch {
      this.fallback = entries;
    }
    this.dispatchEvent(new Event("change"));
  }
}

export const libraries = {
  patch: new Library<Patch>(
    "sound-field-modulate-library.patch.v2",
    normalizePatch,
  ),
  operator: new Library<OperatorParams>(
    "sound-field-modulate-library.operator.v1",
    normalizeOperator,
  ),
  oscillator: new Library<OscillatorParams>(
    "sound-field-modulate-library.oscillator.v1",
    normalizeOscillator,
  ),
  envelope: new Library<EnvelopeParams>(
    "sound-field-modulate-library.envelope.v1",
    normalizeEnvelope,
  ),
  keyScale: new Library<KeyScaleParams>(
    "sound-field-modulate-library.keyScale.v1",
    normalizeKeyScale,
  ),
  lfo: new Library<LfoParams>(
    "sound-field-modulate-library.lfo.v1",
    normalizeLfo,
  ),
};
