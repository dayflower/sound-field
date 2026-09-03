import { translate as t } from "../shared/i18n";
import { parsePatchJson } from "./patch-json";
import type { SynthPatch } from "./types";

export interface PatchDialog {
  dispose(): void;
}

export function createPatchDialog(
  root: HTMLElement,
  getPatch: () => SynthPatch,
  replacePatch: (patch: SynthPatch) => void,
): PatchDialog {
  const dialog = root.querySelector<HTMLDialogElement>("[data-json-dialog]");
  const openButton =
    root.querySelector<HTMLButtonElement>("[data-json-button]");
  const closeButton =
    root.querySelector<HTMLButtonElement>("[data-json-close]");
  const copyButton = root.querySelector<HTMLButtonElement>("[data-json-copy]");
  const loadButton = root.querySelector<HTMLButtonElement>("[data-json-load]");
  const input = root.querySelector<HTMLTextAreaElement>("[data-json-input]");
  const status = root.querySelector<HTMLElement>("[data-json-status]");
  const resetTimers = new Set<number>();
  let disposed = false;

  const resetButtonLabel = (
    button: HTMLButtonElement,
    translationKey: string,
  ): void => {
    const timer = window.setTimeout(() => {
      resetTimers.delete(timer);
      if (!disposed) button.textContent = t(translationKey);
    }, 1200);
    resetTimers.add(timer);
  };
  const onOpen = (): void => {
    if (input) input.value = JSON.stringify(getPatch(), null, 2);
    if (status) status.textContent = "";
    dialog?.showModal();
  };
  const onClose = (): void => dialog?.close();
  const onCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify(getPatch(), null, 2));
    if (disposed || !copyButton) return;
    copyButton.textContent = t("copied");
    resetButtonLabel(copyButton, "copy");
  };
  const onLoad = (): void => {
    if (!input || !status) return;
    try {
      replacePatch(parsePatchJson(input.value));
      status.textContent = t("patchLoaded");
      status.classList.remove("error");
      if (!loadButton) return;
      loadButton.textContent = t("loaded");
      resetButtonLabel(loadButton, "load");
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : t("patchLoadFailed");
      status.classList.add("error");
    }
  };

  openButton?.addEventListener("click", onOpen);
  closeButton?.addEventListener("click", onClose);
  copyButton?.addEventListener("click", onCopy);
  loadButton?.addEventListener("click", onLoad);

  return {
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      openButton?.removeEventListener("click", onOpen);
      closeButton?.removeEventListener("click", onClose);
      copyButton?.removeEventListener("click", onCopy);
      loadButton?.removeEventListener("click", onLoad);
      for (const timer of resetTimers) window.clearTimeout(timer);
      resetTimers.clear();
    },
  };
}
