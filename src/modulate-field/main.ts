import "./styles.css";
import { requiredElement } from "../shared/dom";
import { refreshI18n } from "../shared/i18n";
import { ModulateSynth } from "./audio";
import { createKeyboardController } from "./keyboard-controller";
import { defaultPatch } from "./patch";
import { createPatchController } from "./patch-controller";
import { createPatchDialog } from "./patch-dialog";
import { createStatusView } from "./status-view";
import type { SynthPatch } from "./types";
import { renderApp } from "./ui";
import { startVisualizers } from "./visualizer";

const root = requiredElement("#app", HTMLElement);

const patch: SynthPatch = structuredClone(defaultPatch);
renderApp(root, patch);
refreshI18n();

const synth = new ModulateSynth(patch);
const statusView = createStatusView(root, synth, () => patch);
const patchController = createPatchController(root, patch, (nextPatch) => {
  synth.update(nextPatch);
});
const pendingNotes = new Set<string>();
let disposed = false;
const keyboardController = createKeyboardController({
  root,
  onNoteOn: (note): void => {
    pendingNotes.add(note);
    void synth.start().then(() => {
      if (disposed) return;
      statusView.setAudioReady();
      if (!pendingNotes.delete(note)) return;
      synth.noteOn(note);
    });
  },
  onNoteOff: (note): void => {
    pendingNotes.delete(note);
    synth.noteOff(note);
  },
});
const onOperatorShortcut = (event: KeyboardEvent): void => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (root.querySelector("dialog[open]")) return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  )
    return;
  const operatorIndex = Number(event.key) - 1;
  if (
    !Number.isInteger(operatorIndex) ||
    operatorIndex < 0 ||
    operatorIndex > 3
  )
    return;
  event.preventDefault();
  patchController.toggleOperator(operatorIndex);
};
window.addEventListener("keydown", onOperatorShortcut);
const patchDialog = createPatchDialog(
  root,
  () => patch,
  patchController.replace,
);

const stopVisualizers = startVisualizers(
  synth,
  requiredElement("[data-scope-canvas]", HTMLCanvasElement, root),
  requiredElement("[data-spectrum-canvas]", HTMLCanvasElement, root),
);

const onLanguageChange = (): void => {
  statusView.refreshLanguage();
  patchController.sync();
  keyboardController.refresh();
};
document.addEventListener("languagechange", onLanguageChange);

const dispose = (): void => {
  if (disposed) return;
  disposed = true;
  document.removeEventListener("languagechange", onLanguageChange);
  window.removeEventListener("keydown", onOperatorShortcut);
  keyboardController.dispose();
  pendingNotes.clear();
  patchDialog.dispose();
  patchController.dispose();
  statusView.dispose();
  stopVisualizers();
  synth.dispose();
};
window.addEventListener("pagehide", dispose, { once: true });
