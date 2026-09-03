import { bandsToCurve } from "./spectrum-curve";
import type { NoisePreset, NoiseState, PresetId } from "./types";

export const PRESETS: readonly NoisePreset[] = [
  { id: "white", en: "WHITE", levels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "pink", en: "PINK", levels: [12, 9, 6, 3, 0, -3, -6, -9, -12, -15] },
  {
    id: "brown",
    en: "BROWN",
    levels: [12, 12, 12, 8, 2, -4, -10, -16, -22, -24],
  },
  { id: "blue", en: "BLUE", levels: [-15, -12, -9, -6, -3, 0, 3, 6, 9, 12] },
  {
    id: "violet",
    en: "VIOLET",
    levels: [-24, -22, -18, -12, -6, 0, 6, 10, 12, 12],
  },
  { id: "grey", en: "GREY", levels: [8, 3, -2, -5, -6, -5, -2, 2, 6, 10] },
  { id: "custom", en: "CUSTOM", levels: null },
];

export function presetFor(id: PresetId): NoisePreset {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown noise preset: ${id}`);
  return preset;
}

export function createInitialState(): NoiseState {
  const levels = [...(presetFor("pink").levels ?? [])];
  const curve = bandsToCurve(levels);
  return {
    type: "pink",
    levels,
    customLevels: [...levels],
    curve,
    customCurve: [...curve],
    playing: false,
    startedAt: 0,
    elapsedBefore: 0,
    audio: null,
    importedBuffer: null,
    importedFileName: "",
    editorMode: "curve",
    drawingCurve: false,
    lastCurveIndex: null,
    animationFrame: null,
    clockTimer: null,
  };
}
