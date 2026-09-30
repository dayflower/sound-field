// Horizontal slider built on <input type="range"> with linear, log or stepped value mapping.
// Double-click resets to the default value; clicking the value text allows typing an exact value.

import { setTranslatedAttribute, setTranslatedText } from "../../shared/i18n";

export interface SliderOptions {
  labelKey: string;
  min: number;
  max: number;
  value: number;
  defaultValue?: number;
  scale?: "linear" | "log";
  /** Log scale only: the leftmost position maps to 0 instead of min. */
  zeroAtStart?: boolean;
  /** Discrete values; overrides min/max/scale when present. */
  steps?: readonly number[];
  /** Quantization step for linear scale. */
  step?: number;
  /** Fill the track from the center (for signed values). */
  bipolar?: boolean;
  format?: (v: number) => string;
  /** Parses typed text into a value; returns null when invalid. Should accept the output of format. */
  parse?: (text: string) => number | null;
  onChange: (v: number) => void;
}

const RESOLUTION = 1000;

/**
 * Parses a number with an optional unit suffix (case-insensitive), e.g. "12ms" or "0.5 s".
 * `units` maps suffixes to multipliers; a bare number uses `defaultScale`.
 */
export function parseWithUnits(
  text: string,
  units: Record<string, number>,
  defaultScale = 1,
): number | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))\s*(.*)$/.exec(
    text.trim().toLowerCase(),
  );
  if (!m) return null;
  const scale = m[2] === "" ? defaultScale : units[m[2]!];
  return scale === undefined ? null : Number(m[1]) * scale;
}

export class Slider {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly valueText: HTMLButtonElement;
  private editor: HTMLInputElement | null = null;
  private readonly defaultValue: number;
  private readonly positions: number;
  private value: number;

  constructor(private readonly opts: SliderOptions) {
    this.value = opts.value;
    this.defaultValue = opts.defaultValue ?? opts.value;
    this.positions = opts.steps ? opts.steps.length - 1 : RESOLUTION;

    this.el = document.createElement("label");
    this.el.className = "slider";

    const label = document.createElement("span");
    label.className = "slider-label";
    setTranslatedText(label, opts.labelKey);

    this.input = document.createElement("input");
    this.input.type = "range";
    this.input.min = "0";
    this.input.max = String(this.positions);
    this.input.step = "1";

    this.valueText = document.createElement("button");
    this.valueText.type = "button";
    this.valueText.className = "slider-value";
    setTranslatedAttribute(this.valueText, "title", "ui.valueEntryTitle");
    this.valueText.addEventListener("click", (e) => {
      // The button is detached by startEdit, so the surrounding label would otherwise
      // treat the click as its own and move focus to the range input.
      e.preventDefault();
      this.startEdit();
    });

    this.el.append(label, this.input, this.valueText);

    this.input.addEventListener("input", () => {
      const v = this.fromNorm(Number(this.input.value) / this.positions);
      if (v !== this.value) {
        this.value = v;
        this.opts.onChange(v);
      }
      this.render();
    });
    this.input.addEventListener("dblclick", () => {
      this.setValue(this.defaultValue);
      this.opts.onChange(this.value);
    });

    this.setValue(opts.value);
  }

  getValue(): number {
    return this.value;
  }

  /**
   * Updates the displayed value without firing onChange.
   * The exact value is kept; only the thumb position is quantized.
   */
  setValue(v: number): void {
    this.input.value = String(Math.round(this.toNorm(v) * this.positions));
    this.value = v;
    this.render();
  }

  private startEdit(): void {
    if (this.editor) return;
    const editor = document.createElement("input");
    editor.type = "text";
    editor.className = "slider-editor";
    editor.value = this.valueText.textContent ?? "";
    editor.spellcheck = false;
    this.editor = editor;

    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      if (commit) this.commitText(editor.value);
      this.editor = null;
      editor.replaceWith(this.valueText);
    };
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    editor.addEventListener("blur", () => finish(true));

    this.valueText.replaceWith(editor);
    editor.focus();
    editor.select();
  }

  private commitText(text: string): void {
    const { min, max, scale, zeroAtStart } = this.opts;
    const parsed = this.opts.parse
      ? this.opts.parse(text)
      : parseWithUnits(text, {});
    if (parsed === null || !Number.isFinite(parsed)) return;
    const lower = scale === "log" && zeroAtStart ? 0 : min;
    const v = Math.min(max, Math.max(lower, parsed));
    if (v === this.value) return;
    this.setValue(v);
    this.opts.onChange(v);
  }

  private toNorm(v: number): number {
    const { steps, min, max, scale, zeroAtStart } = this.opts;
    if (steps) {
      let best = 0;
      steps.forEach((s, i) => {
        if (Math.abs(s - v) < Math.abs(steps[best]! - v)) best = i;
      });
      return best / (steps.length - 1);
    }
    if (scale === "log" && zeroAtStart && v <= 0) return 0;
    const n =
      scale === "log"
        ? Math.log(v / min) / Math.log(max / min)
        : (v - min) / (max - min);
    return Math.min(1, Math.max(0, n));
  }

  private fromNorm(n: number): number {
    const { steps, min, max, scale, step, zeroAtStart } = this.opts;
    if (steps) return steps[Math.round(n * (steps.length - 1))]!;
    if (scale === "log" && zeroAtStart && n === 0) return 0;
    if (scale === "log") return min * (max / min) ** n;
    const v = min + (max - min) * n;
    return step ? Math.round(v / step) * step : v;
  }

  private render(): void {
    const pos = (Number(this.input.value) / this.positions) * 100;
    const origin = this.opts.bipolar ? 50 : 0;
    this.input.style.setProperty("--fill-from", `${Math.min(origin, pos)}%`);
    this.input.style.setProperty("--fill-to", `${Math.max(origin, pos)}%`);
    this.valueText.textContent = this.opts.format
      ? this.opts.format(this.value)
      : this.value.toFixed(2);
  }
}
