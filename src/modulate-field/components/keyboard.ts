// On-screen piano keyboard (mouse / touch, glissando) plus computer-keyboard mapping.

import { setTranslatedAttribute } from "../../shared/i18n";

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = [
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
];

/** Computer key -> semitone offset from the base note. Two rows, like a tracker. */
const PC_KEYMAP: Record<string, number> = {
  KeyZ: 0,
  KeyS: 1,
  KeyX: 2,
  KeyD: 3,
  KeyC: 4,
  KeyV: 5,
  KeyG: 6,
  KeyB: 7,
  KeyH: 8,
  KeyN: 9,
  KeyJ: 10,
  KeyM: 11,
  Comma: 12,
  KeyL: 13,
  Period: 14,
  Semicolon: 15,
  Slash: 16,
  KeyQ: 12,
  Digit2: 13,
  KeyW: 14,
  Digit3: 15,
  KeyE: 16,
  KeyR: 17,
  Digit5: 18,
  KeyT: 19,
  Digit6: 20,
  KeyY: 21,
  Digit7: 22,
  KeyU: 23,
  KeyI: 24,
  Digit9: 25,
  KeyO: 26,
  Digit0: 27,
  KeyP: 28,
};

export const noteName = (note: number): string =>
  `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

export interface KeyboardOptions {
  from: number;
  to: number;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
}

export class Keyboard {
  readonly el: HTMLElement;
  private readonly keys = new Map<number, HTMLElement>();
  /** Reference counts per note, so mouse and computer keys can overlap safely. */
  private readonly held = new Map<number, number>();
  private readonly pointerNotes = new Map<number, number>();
  private readonly pcNotes = new Map<string, number>();
  private baseNote = 48;

  constructor(private readonly opts: KeyboardOptions) {
    this.el = document.createElement("div");
    this.el.className = "keyboard";
    this.el.setAttribute("role", "group");
    setTranslatedAttribute(this.el, "aria-label", "keyboard");
    this.build();
    this.attachPointer();
    this.attachComputerKeys();
    this.updateLabels();
  }

  get octaveBase(): number {
    return this.baseNote;
  }

  shiftOctave(delta: number): void {
    this.baseNote = Math.min(96, Math.max(12, this.baseNote + delta * 12));
    this.updateLabels();
  }

  releaseAll(): void {
    for (const note of [...this.held.keys()]) {
      this.held.set(note, 1);
      this.release(note);
    }
    this.pointerNotes.clear();
    this.pcNotes.clear();
  }

  private build(): void {
    const { from, to } = this.opts;
    const whiteCount = [...range(from, to)].filter(
      (n) => !BLACK_KEYS.has(n % 12),
    ).length;
    const whiteW = 100 / whiteCount;
    let whiteIndex = 0;
    for (const note of range(from, to)) {
      const key = document.createElement("button");
      key.type = "button";
      key.dataset.note = String(note);
      key.setAttribute("aria-label", noteName(note));
      key.setAttribute("aria-pressed", "false");
      const label = document.createElement("span");
      label.className = "key-label";
      key.append(label);
      if (BLACK_KEYS.has(note % 12)) {
        key.className = "key black";
        key.style.left = `${whiteIndex * whiteW - whiteW * 0.3}%`;
        key.style.width = `${whiteW * 0.6}%`;
      } else {
        key.className = "key white";
        key.style.left = `${whiteIndex * whiteW}%`;
        key.style.width = `${whiteW}%`;
        whiteIndex++;
      }
      this.keys.set(note, key);
      this.el.append(key);
      key.addEventListener("keydown", (event) => {
        if ((event.code !== "Space" && event.code !== "Enter") || event.repeat)
          return;
        event.preventDefault();
        this.press(note);
      });
      key.addEventListener("keyup", (event) => {
        if (event.code !== "Space" && event.code !== "Enter") return;
        event.preventDefault();
        this.release(note);
      });
    }
  }

  private updateLabels(): void {
    const byNote = new Map<number, string>();
    for (const [code, offset] of Object.entries(PC_KEYMAP)) {
      const note = this.baseNote + offset;
      const prev = byNote.get(note);
      byNote.set(note, prev ? `${prev} ${codeLabel(code)}` : codeLabel(code));
    }
    for (const [note, key] of this.keys) {
      const label = key.querySelector(".key-label")!;
      const pc = byNote.get(note);
      label.textContent =
        note % 12 === 0 ? `${pc ?? ""}\n${noteName(note)}` : (pc ?? "");
    }
  }

  private noteAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".key");
    return el && this.el.contains(el) ? Number(el.dataset.note) : null;
  }

  private attachPointer(): void {
    this.el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.el.setPointerCapture(e.pointerId);
      const note = this.noteAt(e.clientX, e.clientY);
      if (note === null) return;
      this.pointerNotes.set(e.pointerId, note);
      this.press(note);
    });
    this.el.addEventListener("pointermove", (e) => {
      if (!this.pointerNotes.has(e.pointerId)) return;
      const prev = this.pointerNotes.get(e.pointerId)!;
      const note = this.noteAt(e.clientX, e.clientY);
      if (note === prev || note === null) return;
      this.release(prev);
      this.pointerNotes.set(e.pointerId, note);
      this.press(note);
    });
    const end = (e: PointerEvent) => {
      const note = this.pointerNotes.get(e.pointerId);
      if (note === undefined) return;
      this.pointerNotes.delete(e.pointerId);
      this.release(note);
    };
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);
  }

  private attachComputerKeys(): void {
    window.addEventListener("keydown", (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.shiftKey && /^Digit[1-4]$/.test(e.code)) return;
      if (document.querySelector("dialog[open]")) return;
      // Let text fields and selects keep their keys; range sliders don't need letter keys.
      if (e.target instanceof HTMLInputElement && e.target.type !== "range")
        return;
      if (e.target instanceof HTMLSelectElement) return;
      if (
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return;
      const offset = PC_KEYMAP[e.code];
      if (offset === undefined || this.pcNotes.has(e.code)) return;
      e.preventDefault();
      const note = this.baseNote + offset;
      this.pcNotes.set(e.code, note);
      this.press(note);
    });
    window.addEventListener("keyup", (e) => {
      const note = this.pcNotes.get(e.code);
      if (note === undefined) return;
      this.pcNotes.delete(e.code);
      this.release(note);
    });
    window.addEventListener("blur", () => this.releaseAll());
  }

  private press(note: number): void {
    const count = this.held.get(note) ?? 0;
    this.held.set(note, count + 1);
    this.keys.get(note)?.classList.add("active");
    this.keys.get(note)?.setAttribute("aria-pressed", "true");
    if (count === 0) this.opts.onNoteOn(note);
  }

  private release(note: number): void {
    const held = this.held.get(note);
    if (held === undefined) return;
    const count = held - 1;
    if (count > 0) {
      this.held.set(note, count);
      return;
    }
    this.held.delete(note);
    this.keys.get(note)?.classList.remove("active");
    this.keys.get(note)?.setAttribute("aria-pressed", "false");
    this.opts.onNoteOff(note);
  }
}

function* range(from: number, to: number): Generator<number> {
  for (let n = from; n <= to; n++) yield n;
}

function codeLabel(code: string): string {
  const special: Record<string, string> = {
    Comma: ",",
    Period: ".",
    Semicolon: ";",
    Slash: "/",
  };
  return special[code] ?? code.replace(/^(Key|Digit)/, "");
}
