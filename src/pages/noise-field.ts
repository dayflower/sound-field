import {
  AudioAnalysisError,
  analyzeAudioBuffer,
} from "../noise-field/audio-analysis";
import { NoiseAudioEngine } from "../noise-field/audio-engine";
import { curvePointFromPointer, editCurve } from "../noise-field/curve-editor";
import { createInitialState, PRESETS, presetFor } from "../noise-field/presets";
import { drawCurve, drawLiveSpectrum } from "../noise-field/renderers";
import {
  BAND_FREQUENCIES,
  bandsToCurve,
  CURVE_SIZE,
  clampCurve,
  curveFrequency,
  curveToBands,
  smoothCurveValues,
} from "../noise-field/spectrum-curve";
import type { NoiseAnalysisMode, PresetId } from "../noise-field/types";
import {
  createNoiseView,
  populateControls,
  setEditorMode,
  updateBands,
  updateCustomProfile,
  updatePreset,
} from "../noise-field/view";
import { updateClock as updateLocalizedClock } from "../shared/clock";
import { formatFrequency } from "../shared/format";
import { translate as t, translateList } from "../shared/i18n";
import { paintRange } from "../shared/range";

const state = createInitialState();
const view = createNoiseView();
const audio = new NoiseAudioEngine(state);

function updateJson(): void {
  view.spectrumJson.value = JSON.stringify(
    {
      format: "noise-field-spectrum",
      version: 1,
      type: state.type,
      bands: state.levels.map((gainDb, index) => ({
        frequencyHz: BAND_FREQUENCIES[index],
        gainDb,
      })),
      curve: state.curve.map((gainDb, index) => ({
        frequencyHz: Number(curveFrequency(index).toFixed(2)),
        gainDb: Number(gainDb.toFixed(2)),
      })),
    },
    null,
    2,
  );
}

function redrawCurve(): void {
  drawCurve(view.curveCanvas, view.curveContext, state.curve);
}

function applyCurve(curve: readonly number[], makeCustom = true): void {
  state.curve = clampCurve(curve);
  state.levels = curveToBands(state.curve);
  if (makeCustom) {
    state.customCurve = [...state.curve];
    state.customLevels = [...state.levels];
    state.type = "custom";
    updateCustomProfile(view, state.levels);
  }
  updateBands(view, state.levels);
  if (makeCustom) updatePreset(view, state.type, state.playing);
  redrawCurve();
  updateJson();
  audio.updateCurve(state.curve);
}

function selectPreset(type: PresetId): void {
  const preset = presetFor(type);
  const levels = preset.levels ?? state.customLevels;
  state.type = type;
  state.levels = [...levels];
  state.curve =
    type === "custom" ? [...state.customCurve] : bandsToCurve(levels);
  updatePreset(view, type, state.playing);
  updateBands(view, state.levels);
  redrawCurve();
  updateJson();
  audio.updateCurve(state.curve);
}

function setSpectrumLevel(index: number, value: number): void {
  state.levels[index] = value;
  state.customLevels = [...state.levels];
  state.curve = bandsToCurve(state.levels);
  state.customCurve = [...state.curve];
  state.type = "custom";
  updateBands(view, state.levels);
  updateCustomProfile(view, state.customLevels);
  updatePreset(view, state.type, state.playing);
  redrawCurve();
  updateJson();
  audio.updateCurve(state.curve);
}

async function togglePower(): Promise<void> {
  try {
    const playing = await audio.toggle(Number(view.volume.value));
    if (playing) state.startedAt = performance.now();
    else state.elapsedBefore += performance.now() - state.startedAt;
    view.powerButton.classList.toggle("is-playing", playing);
    view.powerButton.setAttribute("aria-pressed", String(playing));
    view.nowPlaying.classList.toggle("is-live", playing);
    view.powerLabel.textContent = playing ? t("stop") : t("start");
    view.powerSub.textContent = playing ? "CLICK TO STOP" : "CLICK TO START";
    view.statusText.textContent = playing
      ? `${state.type.toUpperCase()} — LIVE`
      : t("paused");
  } catch (error) {
    console.error(error);
    view.statusText.textContent = t("unavailable");
  }
}

async function applyImportedSpectrum(): Promise<void> {
  if (!state.importedBuffer) return;
  const mode = view.analysisMode.value as NoiseAnalysisMode;
  const modeLabel = mode === "median" ? "MEDIAN" : "MEAN";
  view.analyzeFileButton.disabled = true;
  view.analyzeFileButton.textContent = t("analyzing");
  view.sourceStatus.textContent = t(
    "measuring",
    state.importedFileName,
    modeLabel,
  );
  try {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
    applyCurve(analyzeAudioBuffer(state.importedBuffer, mode));
    view.sourceStatus.textContent = t(
      "applied",
      state.importedFileName,
      modeLabel,
    );
  } catch (error) {
    console.error(error);
    const message =
      error instanceof AudioAnalysisError
        ? error.code === "too-short"
          ? t("tooShort")
          : error.code === "no-signal"
            ? t("noSignal")
            : "ANALYSIS FAILED"
        : error instanceof Error
          ? error.message
          : "ANALYSIS FAILED";
    view.sourceStatus.textContent = `${state.importedFileName} — ${message}`;
  } finally {
    view.analyzeFileButton.disabled = false;
    view.analyzeFileButton.textContent = t("chooseAnotherFile");
  }
}

async function importSpectrumFromFile(file: File | undefined): Promise<void> {
  if (!file) return;
  view.analyzeFileButton.disabled = true;
  view.analyzeFileButton.textContent = "DECODING…";
  view.sourceStatus.textContent = t("decoding", file.name);
  let decodeContext: AudioContext | null = null;
  try {
    const legacyWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Context = window.AudioContext ?? legacyWindow.webkitAudioContext;
    if (!Context)
      throw new Error("Web Audio is not supported by this browser.");
    decodeContext = new Context();
    state.importedBuffer = await decodeContext.decodeAudioData(
      await file.arrayBuffer(),
    );
    state.importedFileName = file.name;
    await applyImportedSpectrum();
  } catch (error) {
    console.error(error);
    state.importedBuffer = null;
    view.sourceStatus.textContent = `${file.name} — ${error instanceof Error ? error.message : "DECODE FAILED"}`;
    view.analyzeFileButton.disabled = false;
    view.analyzeFileButton.textContent = t("chooseFile");
  } finally {
    if (decodeContext && decodeContext.state !== "closed")
      await decodeContext.close();
  }
}

async function copyJson(): Promise<void> {
  try {
    await navigator.clipboard.writeText(view.spectrumJson.value);
  } catch {
    view.spectrumJson.focus();
    view.spectrumJson.select();
    document.execCommand("copy");
  }
  view.copyJsonButton.textContent = t("copied");
  window.setTimeout(() => {
    view.copyJsonButton.textContent = "COPY JSON";
  }, 1400);
}

function editFromPointer(event: PointerEvent): void {
  const point = curvePointFromPointer(view.curveCanvas, event);
  state.curve = editCurve(state.curve, state.lastCurveIndex, point);
  state.lastCurveIndex = point.index;
  applyCurve(state.curve);
}
function updateClock(): void {
  updateLocalizedClock(view.clock);
  const elapsed =
    state.elapsedBefore +
    (state.playing ? performance.now() - state.startedAt : 0);
  const seconds = Math.floor(elapsed / 1000);
  view.elapsed.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function renderSpectrum(): void {
  drawLiveSpectrum(view.spectrum, view.spectrumContext, state);
  state.animationFrame = window.requestAnimationFrame(renderSpectrum);
}
function dispose(): void {
  if (state.animationFrame !== null)
    window.cancelAnimationFrame(state.animationFrame);
  if (state.clockTimer !== null) window.clearInterval(state.clockTimer);
  audio.dispose();
}

populateControls(view, PRESETS, state.levels, selectPreset, setSpectrumLevel);
view.sourceStatus.textContent = t("noSource");
view.powerButton.addEventListener("click", () => void togglePower());
view.copyJsonButton.addEventListener("click", () => void copyJson());
view.spectrumJson.addEventListener("focus", () => view.spectrumJson.select());
view.analyzeFileButton.addEventListener("click", () => {
  view.sourceFile.value = "";
  view.sourceFile.click();
});
view.sourceFile.addEventListener(
  "change",
  () => void importSpectrumFromFile(view.sourceFile.files?.[0]),
);
view.analysisMode.addEventListener(
  "change",
  () => void applyImportedSpectrum(),
);
view.curveTab.addEventListener("click", () => {
  state.editorMode = "curve";
  setEditorMode(view, state.editorMode);
  window.requestAnimationFrame(redrawCurve);
});
view.bandTab.addEventListener("click", () => {
  state.editorMode = "band";
  setEditorMode(view, state.editorMode);
});
view.smoothCurveButton.addEventListener("click", () =>
  applyCurve(smoothCurveValues(state.curve, 4)),
);
view.flattenCurveButton.addEventListener("click", () =>
  applyCurve(Array<number>(CURVE_SIZE).fill(0)),
);
view.curveCanvas.addEventListener("pointerdown", (event) => {
  state.drawingCurve = true;
  state.lastCurveIndex = null;
  view.curveCanvas.setPointerCapture(event.pointerId);
  editFromPointer(event);
});
view.curveCanvas.addEventListener("pointermove", (event) => {
  if (state.drawingCurve) editFromPointer(event);
});
const finishCurveEdit = (): void => {
  state.drawingCurve = false;
  state.lastCurveIndex = null;
};
view.curveCanvas.addEventListener("pointerup", finishCurveEdit);
view.curveCanvas.addEventListener("pointercancel", finishCurveEdit);
view.lowCut.addEventListener("input", () => {
  const value = Number(view.lowCut.value);
  view.lowCutValue.textContent = formatFrequency(value, "hertz");
  audio.setLowCut(value);
  paintRange(view.lowCut);
});
view.highCut.addEventListener("input", () => {
  const value = Number(view.highCut.value);
  view.highCutValue.textContent = formatFrequency(value, "hertz");
  audio.setHighCut(value);
  paintRange(view.highCut);
});
view.volume.addEventListener("input", () => {
  const value = Number(view.volume.value);
  view.volumeValue.textContent = `${value}%`;
  audio.setVolume(value);
  paintRange(view.volume);
});
view.resetButton.addEventListener("click", () => {
  view.lowCut.value = "20";
  view.lowCut.dispatchEvent(new Event("input"));
  view.highCut.value = "20000";
  view.highCut.dispatchEvent(new Event("input"));
  selectPreset("white");
});
window.addEventListener("resize", redrawCurve);
window.addEventListener("pagehide", dispose, { once: true });
window.addEventListener("beforeunload", dispose, { once: true });
document.addEventListener("languagechange", () => {
  for (const preset of PRESETS) {
    const button = view.presetGrid.querySelector(`[data-type="${preset.id}"]`);
    const [name = preset.id, description = ""] = translateList(
      `presets.${preset.id}`,
    );
    button?.querySelector("b")?.replaceChildren(name);
    if (button instanceof HTMLElement) button.title = description;
  }
  view.eqControls.querySelectorAll<HTMLElement>(".eq-band").forEach((label) => {
    const frequency = label.querySelector("span")?.textContent ?? "";
    label
      .querySelector("input")
      ?.setAttribute("aria-label", t("bandLevel", frequency));
  });
  view.powerLabel.textContent = state.playing ? t("stop") : t("start");
  if (!state.importedBuffer && !view.analyzeFileButton.disabled)
    view.sourceStatus.textContent = t("noSource");
  if (!view.analyzeFileButton.disabled)
    view.analyzeFileButton.textContent = state.importedBuffer
      ? t("chooseAnotherFile")
      : t("chooseFile");
});
for (const input of [view.lowCut, view.highCut, view.volume]) paintRange(input);
updateJson();
redrawCurve();
updateClock();
state.clockTimer = window.setInterval(updateClock, 500);
renderSpectrum();
