import { translate as t } from "../shared/i18n";
import type { PresetKind, PresetValueByKind } from "./preset-library";
import { createPresetLibrary } from "./preset-library";
import type { SynthPatch } from "./types";

interface PresetMenusOptions {
  root: HTMLElement;
  getPatch(): SynthPatch;
  updatePatch(mutator: (patch: SynthPatch) => void): void;
  replacePatch(patch: SynthPatch): void;
  openJson(): void;
}

interface ActiveSave {
  kind: PresetKind;
  operatorIndex: number | undefined;
}

const labels: Record<PresetKind, string> = {
  patch: "presetPatch",
  operator: "presetOperator",
  parameters: "presetParameters",
  envelope: "presetEnvelope",
};

function kindFrom(menu: HTMLElement): PresetKind | undefined {
  const kind = menu.dataset.presetKind;
  return kind === "patch" ||
    kind === "operator" ||
    kind === "parameters" ||
    kind === "envelope"
    ? kind
    : undefined;
}

function operatorIndexFrom(menu: HTMLElement): number | undefined {
  const index = Number(menu.dataset.operator);
  return Number.isInteger(index) && index >= 0 && index < 4 ? index : undefined;
}

export interface PresetMenus {
  refresh(): void;
  dispose(): void;
}

export function createPresetMenus(options: PresetMenusOptions): PresetMenus {
  const library = createPresetLibrary();
  const dialog = options.root.querySelector<HTMLDialogElement>(
    "[data-preset-dialog]",
  );
  const nameInput =
    options.root.querySelector<HTMLInputElement>("[data-preset-name]");
  const dialogTitle = options.root.querySelector<HTMLElement>(
    "[data-preset-dialog-title]",
  );
  const dialogStatus = options.root.querySelector<HTMLElement>(
    "[data-preset-dialog-status]",
  );
  let activeSave: ActiveSave | undefined;

  const menus = (): HTMLElement[] =>
    Array.from(
      options.root.querySelectorAll<HTMLElement>("[data-preset-menu]"),
    );

  const valueFor = <K extends PresetKind>(
    kind: K,
    operatorIndex: number | undefined,
  ): PresetValueByKind[K] | undefined => {
    const patch = options.getPatch();
    if (kind === "patch") return structuredClone(patch) as PresetValueByKind[K];
    if (operatorIndex === undefined) return undefined;
    const operator = patch.operators[operatorIndex];
    if (!operator) return undefined;
    if (kind === "operator")
      return structuredClone(operator) as PresetValueByKind[K];
    if (kind === "envelope")
      return structuredClone(operator.envelope) as PresetValueByKind[K];
    const { envelope: _envelope, ...parameters } = operator;
    return structuredClone(parameters) as PresetValueByKind[K];
  };

  const load = <K extends PresetKind>(
    kind: K,
    operatorIndex: number | undefined,
    value: PresetValueByKind[K],
  ): void => {
    if (kind === "patch") {
      options.replacePatch(value as SynthPatch);
      return;
    }
    if (operatorIndex === undefined) return;
    options.updatePatch((patch) => {
      const operator = patch.operators[operatorIndex];
      if (!operator) return;
      if (kind === "operator") Object.assign(operator, value);
      else if (kind === "envelope") Object.assign(operator.envelope, value);
      else Object.assign(operator, value);
    });
  };

  const refreshMenu = (menu: HTMLElement): void => {
    const kind = kindFrom(menu);
    const label = menu.querySelector<HTMLElement>("[data-preset-label]");
    const saveButton =
      menu.querySelector<HTMLButtonElement>("[data-preset-save]");
    if (!kind || !label || !saveButton) return;
    label.textContent = t(labels[kind]);
    menu
      .querySelector("summary")
      ?.setAttribute("aria-label", t("presetMenu", t(labels[kind])));
    saveButton.textContent = t("saveCurrentAs");
    saveButton.setAttribute(
      "aria-label",
      t("saveCurrentAsType", t(labels[kind])),
    );
    const items = menu.querySelector<HTMLElement>("[data-preset-items]");
    if (!items) return;
    items.replaceChildren();
    const presets = library.list(kind);
    if (!presets.length) {
      const empty = document.createElement("p");
      empty.className = "preset-menu-empty";
      empty.textContent = t("noSavedPresets");
      items.append(empty);
      return;
    }
    for (const preset of presets) {
      const row = document.createElement("div");
      row.className = "preset-menu-item";
      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.dataset.presetLoad = preset.id;
      loadButton.textContent = preset.name;
      loadButton.setAttribute("aria-label", t("loadPresetNamed", preset.name));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "preset-menu-delete";
      deleteButton.dataset.presetDelete = preset.id;
      deleteButton.textContent = "×";
      deleteButton.setAttribute(
        "aria-label",
        t("deletePresetNamed", preset.name),
      );
      row.append(loadButton, deleteButton);
      items.append(row);
    }
  };

  const refresh = (): void => {
    for (const menu of menus()) refreshMenu(menu);
    if (dialogTitle) dialogTitle.textContent = t("savePreset");
    if (nameInput) nameInput.placeholder = t("presetNamePlaceholder");
    options.root
      .querySelectorAll<HTMLElement>("[data-preset-dialog-label]")
      .forEach((label) => {
        label.textContent = t("presetName");
      });
    options.root
      .querySelectorAll<HTMLButtonElement>("[data-preset-dialog-cancel]")
      .forEach((button) => {
        button.textContent = t("cancel");
      });
    options.root
      .querySelectorAll<HTMLButtonElement>("[data-preset-dialog-confirm]")
      .forEach((button) => {
        button.textContent = t("save");
      });
  };

  const openSaveDialog = (menu: HTMLElement): void => {
    const kind = kindFrom(menu);
    if (!kind) return;
    activeSave = { kind, operatorIndex: operatorIndexFrom(menu) };
    const typeName = t(labels[kind]);
    const names = new Set(library.list(kind).map((preset) => preset.name));
    let number = 1;
    while (names.has(`${typeName} ${number}`)) number += 1;
    if (dialogTitle) dialogTitle.textContent = t("saveCurrentAsType", typeName);
    if (dialogStatus) dialogStatus.textContent = "";
    if (nameInput) nameInput.value = `${typeName} ${number}`;
    dialog?.showModal();
    nameInput?.focus();
    nameInput?.select();
  };

  const closeSaveDialog = (): void => {
    activeSave = undefined;
    dialog?.close();
  };

  const closeMenusExcept = (currentMenu?: HTMLElement): void => {
    for (const menu of menus()) {
      if (menu !== currentMenu) menu.removeAttribute("open");
    }
  };

  const saveActivePreset = (): void => {
    if (!activeSave) return;
    const value = valueFor(activeSave.kind, activeSave.operatorIndex);
    if (!value || !nameInput) return;
    if (!library.save(activeSave.kind, nameInput.value, value)) {
      if (dialogStatus) dialogStatus.textContent = t("presetNameUnavailable");
      return;
    }
    closeSaveDialog();
    refresh();
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const menu = target.closest<HTMLElement>("[data-preset-menu]");
    const save = target.closest<HTMLButtonElement>("[data-preset-save]");
    if (save && menu) {
      menu.removeAttribute("open");
      openSaveDialog(menu);
      return;
    }
    const jsonOpen = target.closest<HTMLButtonElement>("[data-json-open]");
    if (jsonOpen) {
      menu?.removeAttribute("open");
      options.openJson();
      return;
    }
    const loadButton = target.closest<HTMLButtonElement>("[data-preset-load]");
    if (loadButton && menu) {
      const kind = kindFrom(menu);
      if (!kind) return;
      const preset = library
        .list(kind)
        .find((entry) => entry.id === loadButton.dataset.presetLoad);
      if (!preset) return;
      load(kind, operatorIndexFrom(menu), preset.value);
      menu.removeAttribute("open");
      return;
    }
    const deleteButton = target.closest<HTMLButtonElement>(
      "[data-preset-delete]",
    );
    if (deleteButton && menu) {
      const kind = kindFrom(menu);
      const id = deleteButton.dataset.presetDelete;
      if (!kind || !id) return;
      library.remove(kind, id);
      refresh();
      return;
    }
    if (
      target.closest("[data-preset-dialog-cancel], [data-preset-dialog-close]")
    ) {
      closeSaveDialog();
      return;
    }
    if (target.closest("[data-preset-dialog-confirm]") && activeSave)
      saveActivePreset();
  };

  const onNameKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveActivePreset();
  };
  const onDialogClose = (): void => {
    activeSave = undefined;
  };
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    const currentMenu =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-preset-menu]")
        : undefined;
    closeMenusExcept(currentMenu ?? undefined);
  };

  options.root.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onPointerDown);
  nameInput?.addEventListener("keydown", onNameKeyDown);
  dialog?.addEventListener("close", onDialogClose);
  refresh();
  return {
    refresh,
    dispose: (): void => {
      options.root.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onPointerDown);
      nameInput?.removeEventListener("keydown", onNameKeyDown);
      dialog?.removeEventListener("close", onDialogClose);
    },
  };
}
