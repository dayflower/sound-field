import { requiredCanvasContext, requiredElement } from "../shared/dom";
import { translate, translateList } from "../shared/i18n";
import { paintRange } from "../shared/range";
import { BAND_FREQUENCIES } from "./spectrum-curve";
import type { NoisePreset, PresetId } from "./types";

export interface NoiseView {
  powerButton: HTMLButtonElement;
  powerLabel: HTMLElement;
  powerSub: HTMLElement;
  nowPlaying: HTMLElement;
  statusText: HTMLElement;
  spectrum: HTMLCanvasElement;
  spectrumContext: CanvasRenderingContext2D;
  presetGrid: HTMLElement;
  sourceStatus: HTMLElement;
  analyzeFileButton: HTMLButtonElement;
  sourceFile: HTMLInputElement;
  analysisMode: HTMLSelectElement;
  resetButton: HTMLButtonElement;
  lowCut: HTMLInputElement;
  lowCutValue: HTMLElement;
  highCut: HTMLInputElement;
  highCutValue: HTMLElement;
  curveTab: HTMLButtonElement;
  bandTab: HTMLButtonElement;
  curveEditor: HTMLElement;
  bandEditor: HTMLElement;
  smoothCurveButton: HTMLButtonElement;
  flattenCurveButton: HTMLButtonElement;
  curveCanvas: HTMLCanvasElement;
  curveContext: CanvasRenderingContext2D;
  eqControls: HTMLElement;
  spectrumJson: HTMLTextAreaElement;
  copyJsonButton: HTMLButtonElement;
  volume: HTMLInputElement;
  volumeValue: HTMLElement;
  clock: HTMLElement;
  elapsed: HTMLElement;
}

export function createNoiseView(): NoiseView {
  const spectrum = requiredElement("#spectrum", HTMLCanvasElement);
  const curveCanvas = requiredElement("#curveCanvas", HTMLCanvasElement);
  return {
    powerButton: requiredElement("#powerButton", HTMLButtonElement),
    powerLabel: requiredElement("#powerLabel", HTMLElement),
    powerSub: requiredElement("#powerSub", HTMLElement),
    nowPlaying: requiredElement(".now-playing", HTMLElement),
    statusText: requiredElement("#statusText", HTMLElement),
    spectrum,
    spectrumContext: requiredCanvasContext(spectrum),
    presetGrid: requiredElement("#presetGrid", HTMLElement),
    sourceStatus: requiredElement("#sourceStatus", HTMLElement),
    analyzeFileButton: requiredElement("#analyzeFileButton", HTMLButtonElement),
    sourceFile: requiredElement("#sourceFile", HTMLInputElement),
    analysisMode: requiredElement("#analysisMode", HTMLSelectElement),
    resetButton: requiredElement("#resetButton", HTMLButtonElement),
    lowCut: requiredElement("#lowCut", HTMLInputElement),
    lowCutValue: requiredElement("#lowCutValue", HTMLElement),
    highCut: requiredElement("#highCut", HTMLInputElement),
    highCutValue: requiredElement("#highCutValue", HTMLElement),
    curveTab: requiredElement("#curveTab", HTMLButtonElement),
    bandTab: requiredElement("#bandTab", HTMLButtonElement),
    curveEditor: requiredElement("#curveEditor", HTMLElement),
    bandEditor: requiredElement("#bandEditor", HTMLElement),
    smoothCurveButton: requiredElement("#smoothCurveButton", HTMLButtonElement),
    flattenCurveButton: requiredElement(
      "#flattenCurveButton",
      HTMLButtonElement,
    ),
    curveCanvas,
    curveContext: requiredCanvasContext(curveCanvas),
    eqControls: requiredElement("#eqControls", HTMLElement),
    spectrumJson: requiredElement("#spectrumJson", HTMLTextAreaElement),
    copyJsonButton: requiredElement("#copyJsonButton", HTMLButtonElement),
    volume: requiredElement("#volume", HTMLInputElement),
    volumeValue: requiredElement("#volumeValue", HTMLElement),
    clock: requiredElement("#clock", HTMLElement),
    elapsed: requiredElement("#elapsed", HTMLElement),
  };
}

function profilePoints(
  levels: readonly number[] | null,
  fallback: readonly number[],
): string {
  const values = levels ?? fallback;
  return values
    .map(
      (level, index) =>
        `${(2 + index * (96 / (values.length - 1))).toFixed(1)},${(3 + ((12 - level) / 36) * 22).toFixed(1)}`,
    )
    .join(" ");
}

export function populateControls(
  view: NoiseView,
  presets: readonly NoisePreset[],
  levels: readonly number[],
  onPreset: (id: PresetId) => void,
  onBand: (index: number, value: number) => void,
): void {
  for (const preset of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preset${preset.id === "pink" ? " active" : ""}`;
    button.dataset.type = preset.id;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(preset.id === "pink"));
    const [name = preset.id, description = ""] = translateList(
      `presets.${preset.id}`,
    );
    button.title = description;
    button.innerHTML = `<b>${name}</b><code>${preset.en} SPECTRUM</code><svg class="mini-wave" viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="${profilePoints(preset.levels, levels)}" /></svg>`;
    button.addEventListener("click", () => onPreset(preset.id));
    view.presetGrid.append(button);
  }
  for (const [index, frequency] of BAND_FREQUENCIES.entries()) {
    const label = document.createElement("label");
    label.className = "eq-band";
    const short = frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`;
    const value = levels[index] ?? 0;
    label.innerHTML = `<output id="eqOut${index}">${value > 0 ? "+" : ""}${value}</output><input aria-label="${translate("bandLevel", short)}" data-index="${index}" type="range" min="-24" max="12" value="${value}" step="1"><span>${short}</span>`;
    const input = label.querySelector("input");
    if (!(input instanceof HTMLInputElement))
      throw new Error("Unable to create EQ input.");
    input.addEventListener("input", () => onBand(index, Number(input.value)));
    view.eqControls.append(label);
  }
}

export function updateBands(view: NoiseView, levels: readonly number[]): void {
  levels.forEach((value, index) => {
    const input = view.eqControls.querySelector(`[data-index="${index}"]`);
    const output = document.querySelector(`#eqOut${index}`);
    if (input instanceof HTMLInputElement) {
      input.value = String(value);
      paintRange(input);
    }
    if (output) output.textContent = value > 0 ? `+${value}` : `${value}`;
  });
}
export function updatePreset(
  view: NoiseView,
  type: PresetId,
  playing: boolean,
): void {
  view.presetGrid
    .querySelectorAll<HTMLButtonElement>(".preset")
    .forEach((button) => {
      const active = button.dataset.type === type;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
  view.statusText.textContent = playing
    ? `${type.toUpperCase()} — LIVE`
    : `${type.toUpperCase()} — READY`;
}
export function updateCustomProfile(
  view: NoiseView,
  levels: readonly number[],
): void {
  view.presetGrid
    .querySelector('.preset[data-type="custom"] polyline')
    ?.setAttribute("points", profilePoints(levels, levels));
}
export function setEditorMode(view: NoiseView, mode: "curve" | "band"): void {
  const curve = mode === "curve";
  view.curveEditor.hidden = !curve;
  view.bandEditor.hidden = curve;
  view.curveTab.classList.toggle("active", curve);
  view.bandTab.classList.toggle("active", !curve);
  view.curveTab.setAttribute("aria-selected", String(curve));
  view.bandTab.setAttribute("aria-selected", String(!curve));
}
