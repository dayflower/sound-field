import { AudioEngine } from "../spectrum-field/audio-engine";
import { renderSpectrum } from "../spectrum-field/spectrum-renderer";
import { createInitialState } from "../spectrum-field/state";
import {
  createSpectrumView,
  updateBinReadout,
  updatePlaybackState,
  updatePlaybackTime,
} from "../spectrum-field/view";
import { renderWaveform } from "../spectrum-field/waveform-renderer";
import { startClock } from "../shared/clock";
import { formatBytes, formatTime } from "../shared/format";
import { translate } from "../shared/i18n";
import { paintRange } from "../shared/range";

const state = createInitialState();
const view = createSpectrumView();
const audioEngine = new AudioEngine(view.audio, state);

function sampleRate(): number {
  return state.context?.sampleRate ?? state.buffer?.sampleRate ?? 48000;
}

function updateBinReadoutForState(): void {
  updateBinReadout(view, sampleRate());
}

function drawWaveform(): void {
  renderWaveform(view.waveform, view.waveContext, state.buffer, view.audio);
}

function drawSpectrum(): void {
  renderSpectrum(
    view.spectrum,
    view.spectrumContext,
    view.peakReadout,
    Number(view.floor.value),
    state,
    view.audio,
  );
  state.animationFrame = window.requestAnimationFrame(drawSpectrum);
}

function isSupportedAudioFile(file: File): boolean {
  return (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|wave|aif|aiff|m4a|aac|ogg|oga|flac|opus|webm)$/i.test(file.name)
  );
}

function updateFileDetails(file: File): void {
  const type = (
    file.type.split("/")[1] ??
    file.name.split(".").pop() ??
    "AUDIO"
  )
    .toUpperCase()
    .replace("MPEG", "MP3")
    .replace("X-M4A", "M4A");
  view.trackName.textContent = file.name;
  view.factName.textContent = file.name;
  view.factSize.textContent = formatBytes(file.size);
  view.factType.textContent = type;
  view.formatShort.textContent = type;
}

async function loadFile(file: File | undefined): Promise<void> {
  if (!file) return;
  if (!isSupportedAudioFile(file)) {
    view.liveStatus.textContent = translate("status.unsupported");
    return;
  }

  const loadVersion = state.loadVersion + 1;
  state.loadVersion = loadVersion;
  audioEngine.prepareFile(file);
  view.liveStatus.textContent = translate("status.decoding");
  view.analyzer.classList.add("has-file");
  view.playButton.disabled = false;
  updateFileDetails(file);

  try {
    const decoded = await audioEngine.decodeFile(file, loadVersion);
    if (loadVersion !== state.loadVersion) return;
    state.buffer = decoded;
    state.channelCount = decoded.numberOfChannels;
    view.factDuration.textContent = formatTime(decoded.duration);
    view.factRate.textContent = `${decoded.sampleRate.toLocaleString()} Hz`;
    view.factChannels.textContent = translate(
      "channels",
      decoded.numberOfChannels,
    );
    view.sampleRateShort.textContent = `${decoded.sampleRate.toLocaleString()} Hz`;
    view.liveStatus.textContent = translate("status.ready");
    view.timeDisplay.textContent = `00:00 / ${formatTime(decoded.duration)}`;
    updateBinReadoutForState();
    drawWaveform();
  } catch (error) {
    if (loadVersion !== state.loadVersion) return;
    console.warn("Waveform preview is unavailable for this file.", error);
    view.factRate.textContent = translate("status.onPlayback");
    view.factChannels.textContent = "—";
    view.sampleRateShort.textContent = translate("status.auto");
    view.liveStatus.textContent = translate("status.ready");
    const syncMetadata = (): void => {
      if (loadVersion !== state.loadVersion) return;
      view.factDuration.textContent = formatTime(view.audio.duration);
      view.timeDisplay.textContent = `00:00 / ${formatTime(view.audio.duration)}`;
      updateBinReadoutForState();
    };
    if (Number.isFinite(view.audio.duration)) syncMetadata();
    else
      view.audio.addEventListener("loadedmetadata", syncMetadata, {
        once: true,
      });
  }
}

async function togglePlayback(): Promise<void> {
  if (!state.file) return;
  try {
    await audioEngine.ensureGraph({
      fftSize: Number(view.fftSize.value),
      smoothingTimeConstant: Number(view.smoothing.value) / 100,
      minDecibels: Number(view.floor.value),
      gain: Number(view.volume.value) / 100,
    });
    if (!state.buffer) {
      view.factRate.textContent = `${sampleRate().toLocaleString()} Hz (OUTPUT)`;
      view.sampleRateShort.textContent = `${sampleRate().toLocaleString()} Hz`;
    }
    updateBinReadoutForState();
    if (view.audio.paused) await view.audio.play();
    else view.audio.pause();
  } catch (error) {
    console.error(error);
    view.liveStatus.textContent = translate("status.playbackFailed");
  }
}

function seekFromPointer(event: PointerEvent): void {
  if (!state.file || !Number.isFinite(view.audio.duration)) return;
  const rect = view.waveWrap.getBoundingClientRect();
  const ratio = Math.max(
    0,
    Math.min(1, (event.clientX - rect.left) / rect.width),
  );
  view.audio.currentTime = ratio * view.audio.duration;
}

function releasePointer(event: PointerEvent): void {
  state.dragging = false;
  if (view.waveWrap.hasPointerCapture(event.pointerId)) {
    view.waveWrap.releasePointerCapture(event.pointerId);
  }
}

const stopClock = startClock(view.clock);

function dispose(): void {
  if (state.animationFrame !== null) {
    window.cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
  stopClock();
  audioEngine.dispose();
}

view.fileButton.addEventListener("click", () => view.fileInput.click());
view.fileInput.addEventListener("change", () => {
  void loadFile(view.fileInput.files?.[0]);
});
for (const type of ["dragenter", "dragover"]) {
  view.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    view.dropZone.classList.add("is-over");
  });
}
for (const type of ["dragleave", "drop"]) {
  view.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    view.dropZone.classList.remove("is-over");
  });
}
view.dropZone.addEventListener("drop", (event: DragEvent) => {
  void loadFile(event.dataTransfer?.files[0]);
});
view.playButton.addEventListener("click", () => {
  void togglePlayback();
});
for (const type of ["play", "pause", "ended"] as const) {
  view.audio.addEventListener(type, () =>
    updatePlaybackState(view, Boolean(state.file)),
  );
}
view.audio.addEventListener("timeupdate", () => {
  updatePlaybackTime(view, state.buffer?.duration);
  drawWaveform();
});
view.waveWrap.addEventListener("pointerdown", (event) => {
  state.dragging = true;
  view.waveWrap.setPointerCapture(event.pointerId);
  seekFromPointer(event);
});
view.waveWrap.addEventListener("pointermove", (event) => {
  if (state.dragging) seekFromPointer(event);
});
view.waveWrap.addEventListener("pointerup", releasePointer);
view.waveWrap.addEventListener("pointercancel", releasePointer);
view.waveWrap.addEventListener("keydown", (event) => {
  if (
    !state.file ||
    (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
  ) {
    return;
  }
  event.preventDefault();
  view.audio.currentTime = Math.max(
    0,
    Math.min(
      view.audio.duration,
      view.audio.currentTime + (event.key === "ArrowRight" ? 5 : -5),
    ),
  );
});
view.fftSize.addEventListener("change", () => {
  if (state.analyser) state.analyser.fftSize = Number(view.fftSize.value);
  state.frequencyData = null;
  updateBinReadoutForState();
});
view.smoothing.addEventListener("input", () => {
  view.smoothingValue.textContent = `${view.smoothing.value}%`;
  if (state.analyser) {
    state.analyser.smoothingTimeConstant = Number(view.smoothing.value) / 100;
  }
  paintRange(view.smoothing);
});
view.floor.addEventListener("input", () => {
  const floor = Math.abs(Number(view.floor.value));
  view.floorValue.textContent = `−${floor} dB`;
  view.rangeReadout.textContent = `−${floor} — −10 dB`;
  if (state.analyser) state.analyser.minDecibels = Number(view.floor.value);
  paintRange(view.floor);
});
view.volume.addEventListener("input", () => {
  view.volumeValue.textContent = `${view.volume.value}%`;
  if (state.gain && state.context) {
    state.gain.gain.setTargetAtTime(
      Number(view.volume.value) / 100,
      state.context.currentTime,
      0.02,
    );
  }
  paintRange(view.volume);
});
document.addEventListener("keydown", (event) => {
  const tagName = document.activeElement?.tagName ?? "";
  if (event.code === "Space" && !/INPUT|SELECT|BUTTON/.test(tagName)) {
    event.preventDefault();
    void togglePlayback();
  }
});
window.addEventListener("resize", drawWaveform);
window.addEventListener("pagehide", dispose, { once: true });
window.addEventListener("beforeunload", dispose, { once: true });
document.addEventListener("languagechange", () => {
  updatePlaybackState(view, Boolean(state.file));
  if (!state.file) view.trackName.textContent = translate("noFile");
  if (state.channelCount) {
    view.factChannels.textContent = translate("channels", state.channelCount);
  }
});

view.liveStatus.textContent = translate("status.waiting");
view.trackName.textContent = translate("noFile");
for (const input of [view.smoothing, view.floor, view.volume])
  paintRange(input);
updateBinReadoutForState();
drawWaveform();
drawSpectrum();
