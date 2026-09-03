import { keyboardMarkup } from "./ui";

export interface KeyboardControllerOptions {
  root: HTMLElement;
  onNoteOn(note: string): void;
  onNoteOff(note: string): void;
}

export interface KeyboardController {
  refresh(): void;
  dispose(): void;
}

const computerKeyOffsets: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
};

const noteNames = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export function createKeyboardController({
  root,
  onNoteOn,
  onNoteOff,
}: KeyboardControllerOptions): KeyboardController {
  const keyboard = root.querySelector<HTMLElement>("[data-keyboard]");
  const octaveOutput = root.querySelector<HTMLElement>("[data-octave]");
  const octaveDown = root.querySelector<HTMLElement>("[data-octave-down]");
  const octaveUp = root.querySelector<HTMLElement>("[data-octave-up]");
  const heldComputerKeys = new Map<string, string>();
  const heldPointers = new Map<number, string | null>();
  const noteHoldCounts = new Map<string, number>();
  let octave = 4;
  let disposed = false;

  const updatePressedKey = (note: string, pressed: boolean): void => {
    keyboard
      ?.querySelector<HTMLElement>(`[data-note="${note}"]`)
      ?.classList.toggle("pressed", pressed);
  };

  const holdNote = (note: string): void => {
    const count = noteHoldCounts.get(note) ?? 0;
    noteHoldCounts.set(note, count + 1);
    if (count === 0) onNoteOn(note);
    updatePressedKey(note, true);
  };

  const releaseNote = (note: string): void => {
    const count = noteHoldCounts.get(note);
    if (!count) return;
    if (count === 1) {
      noteHoldCounts.delete(note);
      onNoteOff(note);
      updatePressedKey(note, false);
      return;
    }
    noteHoldCounts.set(note, count - 1);
  };

  const rebuildKeyboard = (): void => {
    if (keyboard) keyboard.innerHTML = keyboardMarkup(octave);
    if (octaveOutput) octaveOutput.textContent = String(octave);
    for (const note of noteHoldCounts.keys()) updatePressedKey(note, true);
  };

  const noteAtPoint = (clientX: number, clientY: number): string | null => {
    const key = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-note]");
    if (!key || !keyboard?.contains(key)) return null;
    return key.dataset.note ?? null;
  };

  const onOctaveDown = (): void => {
    octave = Math.max(1, octave - 1);
    rebuildKeyboard();
  };
  const onOctaveUp = (): void => {
    octave = Math.min(7, octave + 1);
    rebuildKeyboard();
  };
  const onPointerDown = (event: PointerEvent): void => {
    const key = (event.target as Element).closest<HTMLElement>("[data-note]");
    const note = key?.dataset.note;
    if (!note) return;
    event.preventDefault();
    key.setPointerCapture(event.pointerId);
    heldPointers.set(event.pointerId, note);
    holdNote(note);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!heldPointers.has(event.pointerId)) return;
    const currentNote = heldPointers.get(event.pointerId) ?? null;
    const nextNote = noteAtPoint(event.clientX, event.clientY);
    if (nextNote === currentNote) return;
    if (currentNote) releaseNote(currentNote);
    heldPointers.set(event.pointerId, nextNote);
    if (nextNote) holdNote(nextNote);
  };
  const onPointerEnd = (event: PointerEvent): void => {
    if (!heldPointers.has(event.pointerId)) return;
    const note = heldPointers.get(event.pointerId);
    heldPointers.delete(event.pointerId);
    if (note) releaseNote(note);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return;
    const offset = computerKeyOffsets[event.code];
    if (offset === undefined) return;
    if (heldComputerKeys.has(event.code)) return;
    event.preventDefault();
    const noteName = noteNames[offset % 12];
    if (!noteName) return;
    const note = `${noteName}${octave + Math.floor(offset / 12)}`;
    heldComputerKeys.set(event.code, note);
    holdNote(note);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    const note = heldComputerKeys.get(event.code);
    if (!note) return;
    heldComputerKeys.delete(event.code);
    releaseNote(note);
  };

  octaveDown?.addEventListener("click", onOctaveDown);
  octaveUp?.addEventListener("click", onOctaveUp);
  keyboard?.addEventListener("pointerdown", onPointerDown);
  keyboard?.addEventListener("pointermove", onPointerMove);
  keyboard?.addEventListener("pointerup", onPointerEnd);
  keyboard?.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    refresh: rebuildKeyboard,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      octaveDown?.removeEventListener("click", onOctaveDown);
      octaveUp?.removeEventListener("click", onOctaveUp);
      keyboard?.removeEventListener("pointerdown", onPointerDown);
      keyboard?.removeEventListener("pointermove", onPointerMove);
      keyboard?.removeEventListener("pointerup", onPointerEnd);
      keyboard?.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      for (const note of noteHoldCounts.keys()) onNoteOff(note);
      noteHoldCounts.clear();
      heldComputerKeys.clear();
      heldPointers.clear();
    },
  };
}
