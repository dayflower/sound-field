import { startClock, updateClock } from "../shared/clock";
import { translate as t } from "../shared/i18n";
import type { SynthPatch } from "./types";

interface SynthStatus {
  readonly activeVoiceCount: number;
}

export interface StatusView {
  setAudioReady(): void;
  refreshLanguage(): void;
  dispose(): void;
}

export function createStatusView(
  root: HTMLElement,
  synth: SynthStatus,
  getPatch: () => SynthPatch,
): StatusView {
  const clock = root.querySelector<HTMLElement>("#clock");
  const audioStatus = root.querySelector<HTMLElement>("[data-audio-status]");
  const voiceCount = root.querySelector<HTMLElement>("[data-voice-count]");
  let audioReady = false;

  const updateActivity = (): void => {
    if (voiceCount) voiceCount.textContent = String(synth.activeVoiceCount);
    root
      .querySelectorAll<HTMLElement>("[data-operator-panel]")
      .forEach((panel) => {
        const index = Number(panel.dataset.operatorPanel);
        const enabled = getPatch().operators[index]?.enabled ?? false;
        panel
          .querySelector(".signal-led")
          ?.classList.toggle("active", enabled && synth.activeVoiceCount > 0);
      });
  };

  const stopClock = clock ? startClock(clock) : () => {};
  updateActivity();
  const activityTimer = window.setInterval(updateActivity, 80);

  return {
    setAudioReady: (): void => {
      audioReady = true;
      if (!audioStatus) return;
      audioStatus.textContent = t("audioActive");
      audioStatus.removeAttribute("data-i18n");
      audioStatus.parentElement?.classList.add("active");
    },
    refreshLanguage: (): void => {
      if (clock) updateClock(clock);
      if (audioReady && audioStatus) audioStatus.textContent = t("audioActive");
    },
    dispose: (): void => {
      stopClock();
      window.clearInterval(activityTimer);
    },
  };
}
