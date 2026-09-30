// Disk menu for built-in patches and saved items, with inline naming.

import {
  setTranslatedAttribute,
  setTranslatedText,
  translate as t,
} from "../../shared/i18n";
import type { Library } from "../core/library";

export interface LibraryControlOptions<T> {
  library: Library<T>;
  builtins?: Record<string, T>;
  selectedName?: string;
  /** Translation key for auto-generated names, e.g. "Envelope" -> "Envelope 1". */
  baseNameKey: string;
  /** Returns a snapshot of the current value to save. */
  capture: () => T;
  /** Applies a loaded value. */
  apply: (value: T) => void;
  /** Called after a successful load or save, e.g. to show the current name elsewhere. */
  onNameChange?: (name: string) => void;
}

const CONFIRM_TIMEOUT_MS = 3000;

export class LibraryControl<T> {
  readonly el: HTMLDetailsElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly saveRow: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly confirmSave: HTMLButtonElement;
  private readonly items: HTMLElement;
  private selectedName: string | undefined;
  private deleteArmed:
    | {
        name: string;
        button: HTMLButtonElement;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;

  constructor(private readonly opts: LibraryControlOptions<T>) {
    this.el = document.createElement("details");
    this.el.className = "preset-menu library";
    this.selectedName = opts.selectedName;
    const summary = document.createElement("summary");
    const updateSummaryLabel = () =>
      summary.setAttribute("aria-label", t("presetMenu", t(opts.baseNameKey)));
    updateSummaryLabel();
    document.addEventListener("languagechange", updateSummaryLabel);
    document.addEventListener("languagechange", () => this.refresh());
    summary.innerHTML = `<svg class="preset-menu-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h8l3 3v8h-11z" /><path d="M5 2.5v4h5v-4M5.25 11h5.5v2h-5.5z" /></svg>`;
    const popover = div("preset-menu-popover");

    this.saveButton = button("", "");
    setTranslatedText(this.saveButton, "ui.saveCurrentAs");
    setTranslatedAttribute(this.saveButton, "title", "ui.saveCurrentAsTitle");

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    setTranslatedAttribute(this.nameInput, "placeholder", "ui.name");
    this.nameInput.maxLength = 40;
    this.confirmSave = button("", "");
    setTranslatedText(this.confirmSave, "ui.confirm");
    const cancel = button("", "");
    setTranslatedText(cancel, "ui.cancel");
    this.saveRow = div(
      "library-row library-save-row",
      this.nameInput,
      this.confirmSave,
      cancel,
    );
    this.saveRow.hidden = true;
    this.items = div("preset-menu-items");

    popover.append(this.saveButton, this.saveRow, this.items);
    this.el.append(summary, popover);

    this.saveButton.addEventListener("click", () => this.startSave());
    this.confirmSave.addEventListener("click", () => this.finishSave());
    cancel.addEventListener("click", () => this.endSave());
    this.nameInput.addEventListener("input", () => this.updateSaveLabel());
    this.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.finishSave();
      else if (e.key === "Escape") this.endSave();
    });

    opts.library.addEventListener("change", () => this.refresh());
    this.el.addEventListener("toggle", () => {
      if (!this.el.open) {
        this.endSave();
        this.disarmDelete();
      }
    });
    this.el.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!this.saveRow.hidden) this.endSave();
      else this.el.open = false;
      summary.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Node && !this.el.contains(event.target))
        this.el.open = false;
    });
    this.refresh();
  }

  selectName(name: string): void {
    if (name === this.selectedName) return;
    this.selectedName = name;
    this.refresh();
  }

  private refresh(): void {
    this.disarmDelete();
    this.items.replaceChildren();
    if (this.opts.builtins) {
      this.appendGroup(
        "ui.builtInPatches",
        Object.keys(this.opts.builtins),
        true,
      );
    }
    const saved = this.opts.library.names();
    if (saved.length) {
      this.appendGroup(
        this.opts.builtins ? "ui.savedPatches" : "ui.savedItems",
        saved,
        false,
      );
    } else {
      const empty = document.createElement("p");
      empty.className = "preset-menu-empty";
      empty.textContent = t("ui.noneSaved");
      this.items.append(empty);
    }
  }

  private appendGroup(
    labelKey: string,
    names: string[],
    builtin: boolean,
  ): void {
    const group = div("preset-menu-group");
    const heading = document.createElement("p");
    heading.className = "preset-menu-heading";
    heading.textContent = t(labelKey);
    group.append(heading);
    for (const name of names) {
      const row = div("preset-menu-item");
      const load = button(name, t("loadPresetNamed", name));
      if (name === this.selectedName) load.classList.add("current");
      load.addEventListener("click", () => this.load(name, builtin));
      row.append(load);
      if (!builtin) {
        const remove = button("×", t("deletePresetNamed", name));
        remove.className = "preset-menu-delete";
        remove.addEventListener("click", () => this.remove(name, remove));
        row.append(remove);
      }
      group.append(row);
    }
    this.items.append(group);
  }

  private load(name: string, builtin: boolean): void {
    const value = builtin
      ? this.opts.builtins?.[name]
      : this.opts.library.get(name);
    if (value === undefined) return;
    this.opts.apply(structuredClone(value));
    this.selectedName = name;
    this.opts.onNameChange?.(name);
    this.el.open = false;
    this.refresh();
  }

  private startSave(): void {
    this.saveButton.hidden = true;
    this.saveRow.hidden = false;
    this.nameInput.value = this.nextFreeName();
    this.updateSaveLabel();
    this.nameInput.focus();
    this.nameInput.select();
  }

  /** Smallest "<baseName> N" that is not used yet. */
  private nextFreeName(): string {
    for (let n = 1; ; n++) {
      const name = `${t(this.opts.baseNameKey)} ${n}`;
      if (!this.opts.library.has(name)) return name;
    }
  }

  private updateSaveLabel(): void {
    const name = this.nameInput.value.trim();
    if (this.opts.builtins && Object.hasOwn(this.opts.builtins, name)) {
      setTranslatedText(this.confirmSave, "ui.builtInName");
      this.confirmSave.disabled = true;
      return;
    }
    setTranslatedText(
      this.confirmSave,
      this.opts.library.has(name) ? "ui.overwrite" : "ui.confirm",
    );
    this.confirmSave.disabled = name === "";
  }

  private finishSave(): void {
    const name = this.nameInput.value.trim();
    if (
      !name ||
      (this.opts.builtins && Object.hasOwn(this.opts.builtins, name))
    )
      return;
    this.opts.library.save(name, this.opts.capture());
    this.selectedName = name;
    this.endSave();
    this.refresh();
    this.opts.onNameChange?.(name);
    this.el.open = false;
  }

  private endSave(): void {
    this.saveRow.hidden = true;
    this.saveButton.hidden = false;
  }

  /** Deletion needs a second click within a few seconds. */
  private remove(name: string, button: HTMLButtonElement): void {
    if (this.deleteArmed?.name === name) {
      this.disarmDelete();
      if (this.selectedName === name) this.selectedName = undefined;
      this.opts.library.remove(name);
      return;
    }
    this.disarmDelete();
    setTranslatedText(button, "ui.sureDelete");
    button.classList.add("danger");
    const timer = setTimeout(() => this.disarmDelete(), CONFIRM_TIMEOUT_MS);
    this.deleteArmed = { name, button, timer };
  }

  private disarmDelete(): void {
    if (!this.deleteArmed) return;
    clearTimeout(this.deleteArmed.timer);
    this.deleteArmed.button.removeAttribute("data-i18n");
    this.deleteArmed.button.textContent = "×";
    this.deleteArmed.button.classList.remove("danger");
    this.deleteArmed = undefined;
  }
}

function div(className: string, ...children: Node[]): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  el.append(...children);
  return el;
}

function button(text: string, title: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "small-button";
  b.textContent = text;
  if (title) b.title = title;
  return b;
}
