import { startClock } from "../shared/clock";
import {
  refreshI18n,
  setTranslatedAttribute,
  setTranslatedText,
  translate as t,
} from "../shared/i18n";
import {
  Oscilloscope,
  SpectrumAnalyzer,
  type SpectrumMode,
} from "./components/analyzers";
import { OP_COLORS } from "./components/canvas";
import {
  EnvelopeView,
  formatTime,
  parseTime,
} from "./components/envelope-view";
import { KeyScaleView } from "./components/key-scale-view";
import { Keyboard, noteName } from "./components/keyboard";
import { LibraryControl } from "./components/library-control";
import { routingDiagram } from "./components/routing-diagram";
import {
  parseWithUnits,
  Slider,
  type SliderOptions,
} from "./components/slider";
import { AudioEngine } from "./core/audio";
import { libraries } from "./core/library";
import {
  ALGORITHMS,
  clonePatch,
  cloneRouting,
  type EnvelopeParams,
  KEY_SCALE_CURVES,
  type KeyScaleCurve,
  type KeyScaleParams,
  LFO_WAVEFORMS,
  type LfoParams,
  type LfoWaveform,
  normalizeOperator,
  normalizeOscillator,
  normalizePatch,
  OPERATOR_IDS,
  type OperatorParams,
  type Patch,
  PRESETS,
  PW_MAX,
  PW_MIN,
  routingMatches,
  WAVEFORMS,
  type Waveform,
} from "./core/patch";
import { formatPatchFile, parsePatchFile } from "./core/patch-file";

const STORAGE_KEY = "sound-field-modulate-patch.v2";
const RATIO_STEPS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16,
];
const WAVE_LABELS: Record<Waveform, string> = {
  sine: "SIN",
  triangle: "TRI",
  sawtooth: "SAW",
  square: "SQR",
  noise: "NOI",
};
const LFO_WAVE_LABELS: Record<LfoWaveform, string> = {
  triangle: "TRI",
  sawDown: "SAW↓",
  sawUp: "SAW↑",
  square: "SQR",
  sine: "SIN",
  sampleHold: "S/H",
};
const KEY_SCALE_CURVE_LABELS: Record<KeyScaleCurve, string> = {
  lin: "ui.linear",
  exp: "ui.exponential",
};

// ---------------------------------------------------------------------------
// State

let patch: Patch = loadPatch();
let engine: AudioEngine | null = null;
let engineStarting: Promise<void> | null = null;
/** Note events received while the engine is still starting; replayed in order once it is ready. */
const pendingNotes: { on: boolean; note: number }[] = [];
let masterVolume = 0.7;
/** Callbacks that refresh controls from `patch` (used when a preset is loaded). */
const syncers: (() => void)[] = [];

function loadPatch(): Patch {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizePatch(JSON.parse(saved));
  } catch {
    // Ignore broken storage and fall back to the default.
  }
  return clonePatch(PRESETS["E.Piano"]!);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function patchChanged(): void {
  engine?.setPatch(patch);
  patchModified = true;
  notifyPatchName();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patch));
    } catch {
      // Keep the current patch available while storage is unavailable.
    }
  }, 300);
}

/** Applies a change to the patch, then refreshes every control and the engine. */
function applyToPatch(mutate: () => void): void {
  mutate();
  syncers.forEach((sync) => {
    sync();
  });
  patchChanged();
}

/** Name of the current patch, used as the export file name. */
const PATCH_NAME_KEY = "sound-field-modulate-patch-name.v2";
let patchName = (() => {
  try {
    return localStorage.getItem(PATCH_NAME_KEY) ?? "E.Piano";
  } catch {
    return "E.Piano";
  }
})();
let patchModified = false;
const patchNameListeners: ((name: string) => void)[] = [];
function notifyPatchName(): void {
  const displayName = patchModified ? `${patchName} *` : patchName;
  patchNameListeners.forEach((listener) => {
    listener(displayName);
  });
}
function setPatchName(name: string): void {
  patchName = name;
  patchModified = false;
  try {
    localStorage.setItem(PATCH_NAME_KEY, name);
  } catch {
    // Keep the patch name available for this session.
  }
  notifyPatchName();
}

const masterGain = (v: number) => v * v;

// ---------------------------------------------------------------------------
// DOM helpers

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text) el.textContent = props.text;
  el.append(...children);
  return el;
}

function localized<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  key: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = h(tag, { class: className });
  setTranslatedText(element, key);
  return element;
}

// Formatters show typed-in fractional values; each parser accepts its formatter's output.
const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)));
const pct = (v: number) => `${trim(v * 100, 1)}%`;
const parsePct = (t: string) => parseWithUnits(t, { "%": 0.01 }, 0.01);
const formatDb = (v: number) =>
  v === 0 ? "-∞dB" : `${(20 * Math.log10(masterGain(v))).toFixed(1)}dB`;
const parseDb = (t: string): number | null => {
  if (/^\s*-\s*(∞|inf)/i.test(t)) return 0;
  const db = parseWithUnits(t, { db: 1 });
  return db === null ? null : Math.sqrt(10 ** (db / 20));
};
const NOTE_OFFSETS: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};
/** Parses a note name such as "C4", "F#2" or "Bb3" (or a MIDI note number). */
const parseNote = (t: string): number | null => {
  const m = /^\s*([a-g])([#b]?)(-?\d+)\s*$/i.exec(t);
  if (!m) {
    const n = parseWithUnits(t, {});
    return n === null ? null : Math.round(n);
  }
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (
    NOTE_OFFSETS[m[1]!.toLowerCase()]! + accidental + (Number(m[3]) + 1) * 12
  );
};

/** Creates a slider bound to a numeric property of an object obtained lazily from the patch. */
function boundSlider<T>(
  target: () => T,
  key: { [P in keyof T]: T[P] extends number ? P : never }[keyof T],
  opts: Omit<SliderOptions, "value" | "onChange">,
): Slider {
  const slider = new Slider({
    ...opts,
    value: target()[key] as number,
    onChange: (v) => {
      (target()[key] as number) = v;
      patchChanged();
    },
  });
  syncers.push(() => slider.setValue(target()[key] as number));
  return slider;
}

function segmented<V extends string>(
  options: readonly V[],
  labels: Record<V, string>,
  get: () => V,
  set: (v: V) => void,
  translateLabels = false,
): HTMLElement {
  const group = h("div", { class: "segmented" });
  const buttons = options.map((v) => {
    const b = translateLabels
      ? localized("button", labels[v])
      : h("button", { text: labels[v] });
    b.addEventListener("click", () => {
      set(v);
      sync();
      patchChanged();
    });
    group.append(b);
    return b;
  });
  const sync = () => {
    buttons.forEach((b, i) => {
      const selected = options[i] === get();
      b.classList.toggle("selected", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
  };
  syncers.push(sync);
  sync();
  return group;
}

/** Section caption with a library control on the right. */
function sectionHeader(key: string, library: { el: HTMLElement }): HTMLElement {
  return h(
    "div",
    { class: "section-caption" },
    localized("span", key),
    library.el,
  );
}

/** Pulse width slider, shown only while the square wave is selected. */
function pwSlider(target: () => OperatorParams | LfoParams): HTMLElement {
  const el = boundSlider(target, "pw", {
    labelKey: "ui.pulseWidth",
    min: PW_MIN,
    max: PW_MAX,
    step: 0.005,
    defaultValue: 0.5,
    format: pct,
    parse: parsePct,
  }).el;
  const sync = () => (el.hidden = target().wave !== "square");
  syncers.push(sync);
  sync();
  return el;
}

// ---------------------------------------------------------------------------
// Operator panel

const envViews: EnvelopeView[] = [];
const keyScaleViews: KeyScaleView[] = [];

/** Role of an operator in the current routing. */
function operatorRole(index: number): string {
  const id = OPERATOR_IDS[index]!;
  const targets = patch.routing.connections
    .filter((c) => c.from === id)
    .map((c) => c.to);
  const carrier = targets.includes("output");
  const modulator = targets.some((t) => t !== "output");
  return carrier && modulator
    ? "ui.carrierAndMod"
    : carrier
      ? "ui.carrier"
      : modulator
        ? "ui.modulator"
        : "ui.unused";
}

/** ON / OFF switch that dims `panel` while off. */
function enableSwitch(
  panel: HTMLElement,
  get: () => boolean,
  set: (on: boolean) => void,
  titleKey: string,
): HTMLElement {
  const label = h("span");
  const sw = h(
    "button",
    { class: "operator-toggle" },
    h("span", { class: "toggle-track" }, h("i")),
    label,
  );
  sw.type = "button";
  setTranslatedAttribute(sw, "title", titleKey);
  setTranslatedAttribute(sw, "aria-label", titleKey);
  const sync = () => {
    const on = get();
    panel.classList.toggle("off", !on);
    sw.classList.toggle("active", on);
    sw.setAttribute("aria-pressed", String(on));
    setTranslatedText(label, on ? "on" : "off");
  };
  sw.addEventListener("click", () => {
    set(!get());
    sync();
    patchChanged();
  });
  syncers.push(sync);
  sync();
  return sw;
}

function operatorPanel(index: number): HTMLElement {
  const op = (): OperatorParams => patch.operators[index]!;
  const env = (): EnvelopeParams => op().env;
  const color = OP_COLORS[index]!;
  const panel = h("section", { class: "panel operator" });

  const role = h("span", { class: "op-role" });
  const syncRole = () => setTranslatedText(role, operatorRole(index));
  syncers.push(syncRole);
  syncRole();

  const title = h(
    "div",
    { class: "panel-title" },
    h("span", { class: "op-badge", text: `OP${index + 1}` }),
    role,
    h("span", { class: "signal-led" }),
    enableSwitch(
      panel,
      () => op().enabled,
      (on) => (op().enabled = on),
      "ui.operatorToggleTitle",
    ),
    new LibraryControl({
      library: libraries.operator,
      baseNameKey: "ui.operator",
      capture: () => normalizeOperator(op()),
      apply: (v) => applyToPatch(() => (patch.operators[index] = v)),
    }).el,
  );

  const pw = pwSlider(op);
  const wave = segmented(
    WAVEFORMS,
    WAVE_LABELS,
    () => op().wave,
    (v) => {
      op().wave = v;
      pw.hidden = v !== "square";
    },
  );

  const ratioSlider = boundSlider(op, "ratio", {
    labelKey: "ui.ratio",
    min: 0.25,
    max: 16,
    steps: RATIO_STEPS,
    defaultValue: 1,
    format: (v) => `×${trim(v, 3)}`,
    parse: (t) => parseWithUnits(t.trim().replace(/^[×x*]/i, ""), {}),
  });
  const fixedSlider = boundSlider(op, "fixed", {
    labelKey: "ui.fixed",
    min: 1,
    max: 8000,
    scale: "log",
    defaultValue: 440,
    format: (v) =>
      v >= 1000
        ? `${(v / 1000).toFixed(2)}kHz`
        : `${v.toFixed(v < 10 ? 2 : 1)}Hz`,
    parse: (t) => parseWithUnits(t, { hz: 1, khz: 1000 }),
  });
  const syncFreqMode = () => {
    const fixed = op().freqMode === "fixed";
    ratioSlider.el.hidden = fixed;
    fixedSlider.el.hidden = !fixed;
  };
  const freqMode = segmented(
    ["ratio", "fixed"] as const,
    { ratio: "ui.ratioMode", fixed: "ui.fixedMode" },
    () => op().freqMode,
    (v) => {
      op().freqMode = v;
      syncFreqMode();
    },
    true,
  );
  syncers.push(syncFreqMode);
  syncFreqMode();

  const oscColumn = h(
    "div",
    { class: "column" },
    sectionHeader(
      "ui.oscillatorHeader",
      new LibraryControl({
        library: libraries.oscillator,
        baseNameKey: "ui.oscillator",
        capture: () => normalizeOscillator(op()),
        apply: (v) => applyToPatch(() => Object.assign(op(), v)),
      }),
    ),
    h(
      "div",
      { class: "control-line" },
      localized("span", "ui.wave", "caption"),
      wave,
    ),
    pw,
    h(
      "div",
      { class: "control-line" },
      localized("span", "ui.freq", "caption"),
      freqMode,
    ),
    ratioSlider.el,
    fixedSlider.el,
    boundSlider(op, "detune", {
      labelKey: "ui.detune",
      min: -100,
      max: 100,
      step: 1,
      bipolar: true,
      defaultValue: 0,
      format: (v) => `${v > 0 ? "+" : ""}${trim(v, 1)}¢`,
      parse: (t) => parseWithUnits(t, { "¢": 1, c: 1 }),
    }).el,
    boundSlider(op, "level", {
      labelKey: "ui.level",
      min: 0,
      max: 1,
      step: 0.005,
      format: pct,
      parse: parsePct,
    }).el,
    boundSlider(op, "feedback", {
      labelKey: "ui.feedback",
      min: 0,
      max: 1,
      step: 0.005,
      defaultValue: 0,
      format: pct,
      parse: parsePct,
    }).el,
    boundSlider(op, "ams", {
      labelKey: "ui.amSens",
      min: 0,
      max: 1,
      step: 0.005,
      defaultValue: 0,
      format: pct,
      parse: parsePct,
    }).el,
  );

  const timeSlider = (
    key: "attack" | "d1" | "d2" | "release",
    labelKey: string,
    def: number,
  ) =>
    boundSlider(env, key, {
      labelKey,
      min: 0.001,
      max: 10,
      scale: "log",
      zeroAtStart: true,
      defaultValue: def,
      format: formatTime,
      parse: parseTime,
    }).el;
  const levelSlider = (key: "l1" | "l2", labelKey: string, def: number) =>
    boundSlider(env, key, {
      labelKey,
      min: 0,
      max: 1,
      step: 0.005,
      defaultValue: def,
      format: pct,
      parse: parsePct,
    }).el;

  const envColumn = h(
    "div",
    { class: "column" },
    sectionHeader(
      "ui.envelopeHeader",
      new LibraryControl({
        library: libraries.envelope,
        baseNameKey: "ui.envelope",
        capture: () => ({ ...env() }),
        apply: (v) => applyToPatch(() => (op().env = v)),
      }),
    ),
    timeSlider("attack", "ui.attack", 0.005),
    timeSlider("d1", "ui.d1Time", 0.3),
    levelSlider("l1", "ui.d1Level", 0.7),
    timeSlider("d2", "ui.d2Time", 1),
    levelSlider("l2", "ui.d2Level", 0.5),
    timeSlider("release", "ui.release", 0.3),
  );

  const canvas = h("canvas", { class: "env-canvas" });
  envViews[index] = new EnvelopeView(canvas, env, color);

  const keyScale = (): KeyScaleParams => op().keyScale;
  const curveLine = (key: "leftCurve" | "rightCurve", captionKey: string) =>
    h(
      "div",
      { class: "control-line" },
      localized("span", captionKey, "caption"),
      segmented(
        KEY_SCALE_CURVES,
        KEY_SCALE_CURVE_LABELS,
        () => keyScale()[key],
        (v) => (keyScale()[key] = v),
        true,
      ),
    );
  const depthSlider = (
    key: "leftDepth" | "rightDepth",
    labelKey: string,
    titleKey: string,
  ) => {
    const el = boundSlider(keyScale, key, {
      labelKey,
      min: -24,
      max: 24,
      step: 0.5,
      bipolar: true,
      defaultValue: 0,
      format: (v) => `${v > 0 ? "+" : ""}${trim(v, 1)}dB`,
      parse: (t) => parseWithUnits(t, { db: 1 }),
    }).el;
    setTranslatedAttribute(el, "title", titleKey);
    return el;
  };
  const breakPoint = boundSlider(keyScale, "breakPoint", {
    labelKey: "ui.breakPoint",
    min: 21,
    max: 108,
    step: 1,
    defaultValue: 60,
    format: noteName,
    parse: parseNote,
  }).el;
  setTranslatedAttribute(breakPoint, "title", "ui.breakPointTitle");
  const rate = boundSlider(keyScale, "rate", {
    labelKey: "ui.rate",
    min: 0,
    max: 1,
    step: 0.005,
    defaultValue: 0,
    format: pct,
    parse: parsePct,
  }).el;
  setTranslatedAttribute(rate, "title", "ui.rateScaleTitle");

  const keyScaleCanvas = h("canvas", { class: "key-scale-canvas" });
  keyScaleViews[index] = new KeyScaleView(keyScaleCanvas, op, color);

  const keyScaleSection = h(
    "div",
    { class: "key-scale" },
    sectionHeader(
      "ui.keyScalingHeader",
      new LibraryControl({
        library: libraries.keyScale,
        baseNameKey: "ui.keyScaling",
        capture: () => ({ ...keyScale() }),
        apply: (v) => applyToPatch(() => (op().keyScale = v)),
      }),
    ),
    h(
      "div",
      { class: "columns" },
      h(
        "div",
        { class: "column" },
        curveLine("leftCurve", "ui.leftCurve"),
        depthSlider("leftDepth", "ui.leftDepth", "ui.belowDepthTitle"),
        breakPoint,
      ),
      h(
        "div",
        { class: "column" },
        curveLine("rightCurve", "ui.rightCurve"),
        depthSlider("rightDepth", "ui.rightDepth", "ui.aboveDepthTitle"),
        rate,
      ),
    ),
    keyScaleCanvas,
  );

  panel.append(
    title,
    h("div", { class: "columns" }, oscColumn, envColumn),
    canvas,
    keyScaleSection,
  );
  panel.style.setProperty("--op-color", color);
  return panel;
}

// ---------------------------------------------------------------------------
// LFO panel

function lfoPanel(): HTMLElement {
  const lfo = (): LfoParams => patch.lfo;

  const panel = h("section", { class: "panel lfo" });
  const enabled = enableSwitch(
    panel,
    () => lfo().enabled,
    (on) => (lfo().enabled = on),
    "ui.lfoToggleTitle",
  );

  const title = h(
    "div",
    { class: "panel-title" },
    h("span", { text: "LFO" }),
    enabled,
    new LibraryControl({
      library: libraries.lfo,
      baseNameKey: "ui.lfo",
      capture: () => ({ ...lfo() }),
      apply: (v) => applyToPatch(() => (patch.lfo = v)),
    }).el,
  );

  const pw = pwSlider(lfo);
  const wave = segmented(
    LFO_WAVEFORMS,
    LFO_WAVE_LABELS,
    () => lfo().wave,
    (v) => {
      lfo().wave = v;
      pw.hidden = v !== "square";
    },
  );
  const keySync = segmented(
    ["off", "on"] as const,
    { off: "off", on: "on" },
    () => (lfo().keySync ? "on" : "off"),
    (v) => (lfo().keySync = v === "on"),
    true,
  );
  setTranslatedAttribute(keySync, "title", "ui.keySyncTitle");

  const waveColumn = h(
    "div",
    { class: "column" },
    h(
      "div",
      { class: "control-line" },
      localized("span", "ui.wave", "caption"),
      wave,
    ),
    pw,
    h(
      "div",
      { class: "control-line" },
      localized("span", "ui.sync", "caption"),
      keySync,
    ),
    boundSlider(lfo, "rate", {
      labelKey: "ui.rate",
      min: 0.05,
      max: 50,
      scale: "log",
      defaultValue: 5,
      format: (v) => `${v.toFixed(v < 1 ? 3 : v < 10 ? 2 : 1)}Hz`,
      parse: (t) => parseWithUnits(t, { hz: 1 }),
    }).el,
    boundSlider(lfo, "delay", {
      labelKey: "ui.delay",
      min: 0.01,
      max: 10,
      scale: "log",
      zeroAtStart: true,
      defaultValue: 0,
      format: formatTime,
      parse: parseTime,
    }).el,
    boundSlider(lfo, "fade", {
      labelKey: "ui.fadeIn",
      min: 0.01,
      max: 10,
      scale: "log",
      zeroAtStart: true,
      defaultValue: 0,
      format: formatTime,
      parse: parseTime,
    }).el,
  );

  const depthColumn = h(
    "div",
    { class: "column" },
    boundSlider(lfo, "pitchDepth", {
      labelKey: "ui.pmDepth",
      min: 1,
      max: 1200,
      scale: "log",
      zeroAtStart: true,
      defaultValue: 0,
      format: (v) => `±${trim(v, 1)}¢`,
      parse: (t) =>
        parseWithUnits(t.trim().replace(/^±/, ""), { "¢": 1, c: 1 }),
    }).el,
    boundSlider(lfo, "ampDepth", {
      labelKey: "ui.amDepth",
      min: 0,
      max: 1,
      step: 0.005,
      defaultValue: 0,
      format: pct,
      parse: parsePct,
    }).el,
    localized("div", "ui.lfoHint", "hint lfo-hint"),
  );

  panel.append(title, h("div", { class: "columns" }, waveColumn, depthColumn));
  return panel;
}

// ---------------------------------------------------------------------------
// Layout

function algorithmPanel(): HTMLElement {
  const buttons = ALGORITHMS.map((alg) => {
    const b = h("button", { class: "algorithm-button" });
    b.title = `${alg.label}: ${alg.formula}`;
    b.innerHTML = routingDiagram(alg.routing, alg.diagram);
    b.append(h("span", { class: "algorithm-label", text: alg.label }));
    b.addEventListener("click", () =>
      applyToPatch(() => (patch.routing = cloneRouting(alg.routing))),
    );
    return b;
  });
  const custom = h("div", { class: "algorithm-button custom selected" });
  setTranslatedAttribute(custom, "title", "ui.customRoutingTitle");
  const sync = () => {
    let matched = false;
    buttons.forEach((b, i) => {
      const on = routingMatches(ALGORITHMS[i]!.routing, patch.routing);
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", String(on));
      matched ||= on;
    });
    custom.hidden = matched;
    if (!matched) {
      custom.innerHTML = routingDiagram(patch.routing);
      custom.append(localized("span", "ui.custom", "algorithm-label"));
    }
  };
  syncers.push(sync);
  sync();

  const eyebrow = h("span", { class: "eyebrow", text: t("connectionPresets") });
  eyebrow.dataset.i18n = "connectionPresets";
  const title = h("h2", { text: t("routing") });
  title.dataset.i18n = "routing";
  return h(
    "section",
    { class: "panel algorithm-panel" },
    h("div", { class: "section-heading" }, h("div", {}, eyebrow, title)),
    h("div", { class: "algorithm-grid" }, ...buttons, custom),
  );
}

/** Patch name, saved patches and JSON export. */
function patchBar(): HTMLElement {
  const name = h("span", { class: "patch-name", text: patchName });
  patchNameListeners.push((nextName) => {
    name.textContent = nextName;
  });

  const library = new LibraryControl({
    library: libraries.patch,
    builtins: PRESETS,
    selectedName: patchName,
    baseNameKey: "ui.patchName",
    capture: () => clonePatch(patch),
    apply: (v) => applyToPatch(() => (patch = v)),
    onNameChange: setPatchName,
  });
  patchNameListeners.push(() => {
    library.selectName(patchModified ? `${patchName} *` : patchName);
  });

  const exportButton = localized("button", "ui.exportJson", "small-button");
  setTranslatedAttribute(exportButton, "title", "ui.exportJsonTitle");
  exportButton.addEventListener("click", () => {
    library.el.open = false;
    exportPatch();
  });

  const fileInput = h("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.hidden = true;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    const result = parsePatchFile(
      await file.text(),
      file.name.replace(/(\.modulate-field)?\.json$/i, ""),
    );
    if ("error" in result) alert(t("ui.cannotImport", file.name, result.error));
    else importPatch(result);
  });
  const importButton = localized("button", "ui.importJson", "small-button");
  setTranslatedAttribute(importButton, "title", "ui.importJsonTitle");
  importButton.addEventListener("click", () => {
    library.el.open = false;
    fileInput.click();
  });

  const editButton = localized("button", "ui.editJson", "small-button");
  setTranslatedAttribute(editButton, "title", "ui.editJsonTitle");
  editButton.addEventListener("click", () => {
    library.el.open = false;
    openJsonDialog();
  });

  library.el
    .querySelector(".preset-menu-popover")
    ?.append(
      h(
        "details",
        { class: "preset-json-menu" },
        h("summary", { text: "JSON" }),
        exportButton,
        importButton,
        editButton,
      ),
      fileInput,
    );

  return h(
    "div",
    { class: "patch-bar" },
    h(
      "div",
      { class: "patch-bar-head" },
      localized("span", "ui.patch", "caption"),
      name,
      library.el,
    ),
  );
}

function patchFileText(): string {
  return formatPatchFile(patch, patchName);
}

function exportPatch(): void {
  const blob = new Blob([patchFileText()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = h("a");
  a.href = url;
  a.download = `${patchName.replace(/[\\/:*?"<>|]+/g, "_")}.modulate-field.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function importPatch({
  name,
  patch: loaded,
}: {
  name: string;
  patch: Patch;
}): void {
  applyToPatch(() => (patch = loaded));
  setPatchName(name);
}

let jsonDialog: { open(): void } | null = null;
function openJsonDialog(): void {
  jsonDialog ??= createJsonDialog();
  jsonDialog.open();
}

function createJsonDialog(): { open(): void } {
  const dialog = h("dialog", { class: "json-dialog" });
  const text = h("textarea", { class: "json-text" });
  text.spellcheck = false;
  const status = h("div", { class: "json-status" });
  const setStatus = (
    message: string,
    error = false,
    localizedMessage = false,
  ) => {
    if (localizedMessage) setTranslatedText(status, message);
    else {
      status.removeAttribute("data-i18n");
      status.textContent = message;
    }
    status.classList.toggle("error", error);
  };
  const button = (labelKey: string, onClick: () => void) => {
    const b = localized("button", labelKey, "small-button");
    b.addEventListener("click", onClick);
    return b;
  };
  dialog.append(
    localized("div", "patchJson", "panel-title"),
    localized("div", "ui.routingJsonHint", "hint"),
    text,
    h(
      "div",
      { class: "json-actions" },
      status,
      button("ui.copy", () => {
        navigator.clipboard.writeText(text.value).then(
          () => setStatus("ui.copied", false, true),
          () => setStatus("ui.copyFailed", true, true),
        );
      }),
      button("ui.apply", () => {
        const result = parsePatchFile(text.value, patchName);
        if ("error" in result) return setStatus(result.error, true);
        importPatch(result);
        text.value = patchFileText();
        setStatus("ui.applied", false, true);
      }),
      button("ui.close", () => dialog.close()),
    ),
  );
  document.body.append(dialog);
  return {
    open() {
      text.value = patchFileText();
      setStatus("");
      dialog.showModal();
    },
  };
}

function buildApp(root: HTMLElement): void {
  const localizedSpan = (key: string, className?: string): HTMLSpanElement =>
    localized("span", key, className);
  const volume = new Slider({
    labelKey: "master",
    min: 0,
    max: 1,
    step: 0.005,
    value: masterVolume,
    format: formatDb,
    parse: parseDb,
    onChange: (v) => {
      masterVolume = v;
      engine?.setMasterGain(masterGain(v));
    },
  });

  const scopeCanvas = h("canvas", { class: "viz-canvas" });
  const spectrumCanvas = h("canvas", { class: "viz-canvas" });

  const operators = h(
    "div",
    { class: "operators-grid operator-row" },
    ...OPERATOR_IDS.map((_, i) => operatorPanel(i)),
  );

  const octaveLabel = h("strong", { class: "octave-label" });
  const keyboard = new Keyboard({
    from: 36,
    to: 84,
    onNoteOn: (note) => {
      if (engine) engine.noteOn(note);
      else pendingNotes.push({ on: true, note });
      lastNote.textContent = noteName(note);
    },
    onNoteOff: (note) => {
      if (engine) engine.noteOff(note);
      else pendingNotes.push({ on: false, note });
    },
  });
  const keyboardWrap = h("div", { class: "keyboard-wrap" }, keyboard.el);
  const onOperatorShortcut = (event: KeyboardEvent): void => {
    if (
      !event.shiftKey ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (root.querySelector("dialog[open]")) return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    )
      return;
    const index = /^Digit([1-4])$/.exec(event.code);
    if (!index) return;
    event.preventDefault();
    const operator = patch.operators[Number(index[1]) - 1];
    if (operator)
      applyToPatch(() => {
        operator.enabled = !operator.enabled;
      });
  };
  window.addEventListener("keydown", onOperatorShortcut);
  const updateOctave = () => {
    octaveLabel.textContent = String(Math.floor(keyboard.octaveBase / 12) - 1);
    const baseKey = keyboard.el.querySelector<HTMLElement>(
      `[data-note="${keyboard.octaveBase}"]`,
    );
    if (baseKey) keyboardWrap.scrollLeft = baseKey.offsetLeft;
  };
  const octaveButton = (text: string, delta: number) => {
    const b = h("button", { text });
    b.type = "button";
    b.dataset.i18n = delta < 0 ? "octaveDown" : "octaveUp";
    b.dataset.i18nAttr = "aria-label";
    b.setAttribute("aria-label", t(b.dataset.i18n));
    b.addEventListener("click", () => {
      keyboard.shiftOctave(delta);
      updateOctave();
    });
    return b;
  };
  const panic = localized("button", "ui.panic", "small-button");
  panic.addEventListener("click", () => {
    keyboard.releaseAll();
    pendingNotes.length = 0;
    engine?.allNotesOff();
    lastNote.textContent = "—";
  });
  const lastNote = h("span", { class: "last-note", text: "—" });
  const keyboardTitle = h("h2", { text: t("keyboard") });
  keyboardTitle.dataset.i18n = "keyboard";
  const keyboardPanel = h(
    "section",
    { class: "keyboard-section keyboard-panel" },
    h(
      "div",
      { class: "keyboard-toolbar" },
      h(
        "div",
        { class: "keyboard-heading" },
        localizedSpan("polyphony", "eyebrow"),
        keyboardTitle,
      ),
      h(
        "div",
        { class: "octave-control" },
        octaveButton("−", -1),
        h(
          "span",
          { class: "octave-readout" },
          localizedSpan("octave"),
          octaveLabel,
        ),
        octaveButton("+", 1),
      ),
      h(
        "div",
        { class: "keyboard-utilities" },
        localized("span", "ui.operatorShortcut", "hint operator-hint"),
        lastNote,
        panic,
      ),
    ),
    keyboardWrap,
  );

  root.innerHTML = `
    <main class="app-shell">
      <header class="site-header">
        <a class="brand" href="./index.html" aria-label="${t("homeLabel")}" data-i18n="homeLabel" data-i18n-attr="aria-label"><span class="brand-mark">M/F</span><span>MODULATE / FIELD</span></a>
        <div class="header-side"><a class="back-link" href="./index.html" data-i18n="backLabel">${t("backLabel")}</a><p class="header-note">REALTIME AUDIO LAB<br />TOKYO — <span id="clock">00:00:00</span></p><label class="language-picker"><select data-language-select></select></label></div>
      </header>
      <section class="field-intro"><span data-i18n="introSynthesis">${t("introSynthesis")}</span><span data-i18n="introLead">${t("introLead")}</span></section>
      <div class="workspace-grid"><div class="performance-column"><section class="monitor-strip" data-monitors></section><section class="synth-controls" data-synth-controls></section><div data-keyboard-slot></div></div><div class="synthesis-column" data-synthesis></div></div>
      <footer><span>MODULATE / FIELD</span><span data-i18n="footer">${t("footer")}</span></footer>
    </main>`;
  const monitors = root.querySelector<HTMLElement>("[data-monitors]")!;
  monitors.append(
    h(
      "div",
      { class: "scope-panel" },
      h(
        "div",
        { class: "monitor-label" },
        localizedSpan("oscilloscope"),
        localizedSpan("time"),
      ),
      scopeCanvas,
    ),
    h(
      "div",
      { class: "scope-panel spectrum" },
      h(
        "div",
        { class: "monitor-label" },
        localizedSpan("spectrum"),
        spectrumModeToggle(),
      ),
      spectrumCanvas,
    ),
    h(
      "div",
      { class: "voice-readout" },
      localizedSpan("activeVoices", "eyebrow"),
      h("strong", { text: "0" }),
      h("small", { text: "/ 8" }),
    ),
  );
  monitors.querySelector("strong")!.dataset.voiceCount = "";
  const controls = root.querySelector<HTMLElement>("[data-synth-controls]")!;
  controls.append(
    h(
      "div",
      { class: "audio-status" },
      h("i"),
      h("span", { text: t("audioSuspended") }),
    ),
    volume.el,
    patchBar(),
  );
  const audioStatus =
    controls.querySelector<HTMLElement>(".audio-status span")!;
  audioStatus.dataset.audioStatus = "";
  audioStatus.dataset.i18n = "audioSuspended";
  root.querySelector("[data-keyboard-slot]")!.append(keyboardPanel);
  updateOctave();
  const synthesis = root.querySelector<HTMLElement>("[data-synthesis]")!;
  const routing = algorithmPanel();
  routing.classList.add("routing-section");
  synthesis.append(routing, operators, lfoPanel());
  const clock = root.querySelector<HTMLElement>("#clock");
  const stopClock = clock ? startClock(clock) : () => {};
  refreshI18n();

  // Browsers only allow audio to start from a user gesture, so the engine is
  // created on the first click or key press anywhere on the page.
  const startAudio = () => {
    if (engineStarting) return;
    engineStarting = AudioEngine.create()
      .then((e) => {
        engine = e;
        e.setPatch(patch);
        e.setMasterGain(masterGain(masterVolume));
        e.onEnvelope = (msg) => {
          msg.ops.forEach((snapshot, i) => {
            envViews[i]?.setLive(snapshot);
          });
          const count = root.querySelector<HTMLElement>("[data-voice-count]");
          if (count) count.textContent = String(msg.activeVoices);
          root
            .querySelectorAll<HTMLElement>(".operator")
            .forEach((panel, i) => {
              panel
                .querySelector(".signal-led")
                ?.classList.toggle(
                  "active",
                  msg.activeVoices > 0 && patch.operators[i]?.enabled === true,
                );
            });
        };
        const status = root.querySelector<HTMLElement>("[data-audio-status]");
        if (status) {
          status.dataset.i18n = "audioActive";
          status.textContent = t("audioActive");
        }
        status?.parentElement?.classList.add("active");
        startAnalyzers(e, scopeCanvas, spectrumCanvas);
        // Replay notes played while the engine was starting. Notes already released are
        // sounded briefly: sending note-off right away would release from a level of zero.
        const held = new Map<number, boolean>();
        for (const { on, note } of pendingNotes) held.set(note, on);
        for (const [note, stillHeld] of held) {
          e.noteOn(note);
          if (!stillHeld) setTimeout(() => e.noteOff(note), 150);
        }
        pendingNotes.length = 0;
        window.removeEventListener("pointerdown", startAudio, true);
        window.removeEventListener("keydown", startAudio, true);
      })
      .catch((err) => {
        console.error("Failed to start audio:", err);
        const status = root.querySelector<HTMLElement>("[data-audio-status]");
        if (status) {
          status.dataset.i18n = "audioFailed";
          status.textContent = t("audioFailed");
        }
        engineStarting = null;
      });
  };
  window.addEventListener("pointerdown", startAudio, true);
  window.addEventListener("keydown", startAudio, true);

  let animationFrameId = 0;
  let lastControlFrame = 0;
  const frame = (time: number): void => {
    if (!document.hidden) {
      if (time - lastControlFrame >= 50) {
        envViews.forEach((view) => {
          view.draw();
        });
        keyScaleViews.forEach((view) => {
          view.draw();
        });
        lastControlFrame = time;
      }
      analyzers.forEach((analyzer) => {
        analyzer.draw();
      });
    }
    animationFrameId = requestAnimationFrame(frame);
  };
  animationFrameId = requestAnimationFrame(frame);
  window.addEventListener(
    "pagehide",
    () => {
      stopClock();
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("keydown", onOperatorShortcut);
      keyboard.releaseAll();
      engine?.allNotesOff();
      void engine?.dispose();
    },
    { once: true },
  );
}

const analyzers: { draw(): void }[] = [];

const SPECTRUM_MODE_KEY = "sound-field-modulate-spectrum-mode.v1";
const SPECTRUM_MODES: readonly SpectrumMode[] = ["native", "bh"];
let spectrumMode: SpectrumMode =
  localStorage.getItem(SPECTRUM_MODE_KEY) === "bh" ? "bh" : "native";
let spectrumAnalyzer: SpectrumAnalyzer | null = null;

/** Switches between AnalyserNode's FFT and the JS Blackman-Harris FFT; not part of the patch. */
function spectrumModeToggle(): HTMLElement {
  const labels: Record<SpectrumMode, [string, string]> = {
    native: ["NATIVE", "ui.nativeSpectrumTitle"],
    bh: ["BH", "ui.bhSpectrumTitle"],
  };
  const group = h("div", { class: "segmented spectrum-mode" });
  const buttons = SPECTRUM_MODES.map((mode) => {
    const b = h("button", { text: labels[mode][0] });
    setTranslatedAttribute(b, "title", labels[mode][1]);
    b.addEventListener("click", () => {
      spectrumMode = mode;
      localStorage.setItem(SPECTRUM_MODE_KEY, mode);
      if (spectrumAnalyzer) spectrumAnalyzer.mode = mode;
      sync();
    });
    group.append(b);
    return b;
  });
  const sync = () => {
    buttons.forEach((b, i) => {
      const selected = SPECTRUM_MODES[i] === spectrumMode;
      b.classList.toggle("selected", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
  };
  sync();
  return group;
}

function startAnalyzers(
  engine: AudioEngine,
  scope: HTMLCanvasElement,
  spectrum: HTMLCanvasElement,
): void {
  spectrumAnalyzer = new SpectrumAnalyzer(spectrum, engine.analyser);
  spectrumAnalyzer.mode = spectrumMode;
  analyzers.push(new Oscilloscope(scope, engine.analyser), spectrumAnalyzer);
}

buildApp(document.getElementById("app")!);
