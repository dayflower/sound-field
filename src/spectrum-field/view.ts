import { formatTime } from "../shared/format";
import { translate } from "../shared/i18n";
import { requiredCanvasContext, requiredElement } from "../shared/dom";

export interface SpectrumView {
  audio: HTMLAudioElement;
  analyzer: HTMLElement;
  dropZone: HTMLElement;
  fileButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  playButton: HTMLButtonElement;
  waveWrap: HTMLElement;
  waveform: HTMLCanvasElement;
  waveContext: CanvasRenderingContext2D;
  spectrum: HTMLCanvasElement;
  spectrumContext: CanvasRenderingContext2D;
  fftSize: HTMLSelectElement;
  smoothing: HTMLInputElement;
  floor: HTMLInputElement;
  volume: HTMLInputElement;
  liveStatus: HTMLElement;
  trackName: HTMLElement;
  factName: HTMLElement;
  factSize: HTMLElement;
  factDuration: HTMLElement;
  factRate: HTMLElement;
  factChannels: HTMLElement;
  factType: HTMLElement;
  formatShort: HTMLElement;
  sampleRateShort: HTMLElement;
  timeDisplay: HTMLElement;
  binReadout: HTMLElement;
  rangeReadout: HTMLElement;
  peakReadout: HTMLElement;
  smoothingValue: HTMLElement;
  floorValue: HTMLElement;
  volumeValue: HTMLElement;
  clock: HTMLElement;
}

export function createSpectrumView(): SpectrumView {
  const spectrum = requiredElement("#spectrum", HTMLCanvasElement);
  const waveform = requiredElement("#waveform", HTMLCanvasElement);
  return {
    audio: requiredElement("#audio", HTMLAudioElement),
    analyzer: requiredElement("#analyzer", HTMLElement),
    dropZone: requiredElement("#dropZone", HTMLElement),
    fileButton: requiredElement("#fileButton", HTMLButtonElement),
    fileInput: requiredElement("#fileInput", HTMLInputElement),
    playButton: requiredElement("#playButton", HTMLButtonElement),
    waveWrap: requiredElement("#waveWrap", HTMLElement),
    waveform,
    waveContext: requiredCanvasContext(waveform),
    spectrum,
    spectrumContext: requiredCanvasContext(spectrum),
    fftSize: requiredElement("#fftSize", HTMLSelectElement),
    smoothing: requiredElement("#smoothing", HTMLInputElement),
    floor: requiredElement("#floor", HTMLInputElement),
    volume: requiredElement("#volume", HTMLInputElement),
    liveStatus: requiredElement("#liveStatus", HTMLElement),
    trackName: requiredElement("#trackName", HTMLElement),
    factName: requiredElement("#factName", HTMLElement),
    factSize: requiredElement("#factSize", HTMLElement),
    factDuration: requiredElement("#factDuration", HTMLElement),
    factRate: requiredElement("#factRate", HTMLElement),
    factChannels: requiredElement("#factChannels", HTMLElement),
    factType: requiredElement("#factType", HTMLElement),
    formatShort: requiredElement("#formatShort", HTMLElement),
    sampleRateShort: requiredElement("#sampleRateShort", HTMLElement),
    timeDisplay: requiredElement("#timeDisplay", HTMLElement),
    binReadout: requiredElement("#binReadout", HTMLElement),
    rangeReadout: requiredElement("#rangeReadout", HTMLElement),
    peakReadout: requiredElement("#peakReadout", HTMLElement),
    smoothingValue: requiredElement("#smoothingValue", HTMLElement),
    floorValue: requiredElement("#floorValue", HTMLElement),
    volumeValue: requiredElement("#volumeValue", HTMLElement),
    clock: requiredElement("#clock", HTMLElement),
  };
}

export function updateBinReadout(view: SpectrumView, sampleRate: number): void {
  view.binReadout.textContent = `${(sampleRate / Number(view.fftSize.value)).toFixed(1)} Hz`;
}

export function updatePlaybackState(
  view: SpectrumView,
  hasFile: boolean,
): void {
  const playing = !view.audio.paused && !view.audio.ended;
  view.analyzer.classList.toggle("is-playing", playing);
  view.playButton.setAttribute("aria-pressed", String(playing));
  view.playButton.setAttribute(
    "aria-label",
    playing ? translate("pauseLabel") : translate("playLabel"),
  );
  view.liveStatus.textContent = playing
    ? translate("status.analyzing")
    : hasFile
      ? view.audio.ended
        ? translate("status.complete")
        : translate("status.paused")
      : translate("status.waiting");
}

export function updatePlaybackTime(
  view: SpectrumView,
  fallbackDuration: number | undefined,
): void {
  view.timeDisplay.textContent = `${formatTime(view.audio.currentTime)} / ${formatTime(
    view.audio.duration || (fallbackDuration ?? 0),
  )}`;
  const ratio = view.audio.duration
    ? view.audio.currentTime / view.audio.duration
    : 0;
  view.waveWrap.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
}
