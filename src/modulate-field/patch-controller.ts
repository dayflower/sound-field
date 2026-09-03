import { translate as t } from "../shared/i18n";
import { getRoutingPreset } from "./routing";
import type {
  FrequencyMode,
  OperatorSettings,
  SynthPatch,
  Waveform,
} from "./types";
import { envelopeGraphMarkup, formatNumber, routingMarkup } from "./ui";

export interface PatchController {
  replace(nextPatch: SynthPatch): void;
  update(mutator: (patch: SynthPatch) => void): void;
  sync(): void;
  dispose(): void;
}

export function createPatchController(
  root: HTMLElement,
  patch: SynthPatch,
  onPatchChanged: (patch: SynthPatch) => void,
): PatchController {
  const sync = (): void => {
    root
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "[data-key][data-scope]",
      )
      .forEach((control) => {
        const { key, scope } = control.dataset;
        if (!key || !scope) return;
        if (scope === "master") {
          control.value = String(patch.masterGain);
        } else {
          const operator = patch.operators[Number(control.dataset.operator)];
          if (!operator) return;
          control.value = String(
            scope === "envelope"
              ? operator.envelope[key as keyof OperatorSettings["envelope"]]
              : key === "waveform"
                ? operator.waveform
                : operator[
                    key as keyof Pick<
                      OperatorSettings,
                      | "ratio"
                      | "fixedHz"
                      | "detune"
                      | "level"
                      | "modulationIndex"
                      | "feedback"
                    >
                  ],
          );
        }
        if (control instanceof HTMLInputElement) {
          const output = control.closest("label")?.querySelector("output");
          if (output) {
            output.textContent = `${formatNumber(Number(control.value))}${control.dataset.suffix ?? ""}`;
          }
        }
      });

    patch.operators.forEach((operator, index) => {
      const panel = root.querySelector<HTMLElement>(
        `[data-operator-panel="${index}"]`,
      );
      panel?.classList.toggle("disabled", !operator.enabled);
      const toggle = panel?.querySelector<HTMLButtonElement>(
        "[data-operator-toggle]",
      );
      toggle?.classList.toggle("active", operator.enabled);
      toggle?.setAttribute("aria-pressed", String(operator.enabled));
      const label = toggle?.querySelector<HTMLElement>(
        "[data-operator-toggle-label]",
      );
      if (label) {
        const key = operator.enabled ? "on" : "off";
        label.dataset.i18n = key;
        label.textContent = t(key);
      }
      const graph = root.querySelector<HTMLElement>(
        `[data-envelope-graph="${index}"]`,
      );
      if (graph)
        graph.innerHTML = envelopeGraphMarkup(operator.envelope, index);

      panel
        ?.querySelectorAll<HTMLButtonElement>("[data-mode]")
        .forEach((button) => {
          button.classList.toggle(
            "active",
            button.dataset.mode === operator.frequencyMode,
          );
        });
      panel
        ?.querySelector<HTMLElement>("[data-control='ratio']")
        ?.classList.toggle("hidden", operator.frequencyMode !== "ratio");
      panel
        ?.querySelector<HTMLElement>("[data-control='fixedHz']")
        ?.classList.toggle("hidden", operator.frequencyMode !== "fixed");
    });

    const routingControls = root.querySelector<HTMLElement>(
      "[data-routing-controls]",
    );
    if (routingControls)
      routingControls.innerHTML = routingMarkup(patch.routing);
  };

  const update = (mutator: (currentPatch: SynthPatch) => void): void => {
    mutator(patch);
    sync();
    onPatchChanged(patch);
  };
  const onInput = (event: Event): void => {
    const input = event.target;
    if (
      !(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)
    )
      return;
    const key = input.dataset.key;
    const scope = input.dataset.scope;
    if (!key || !scope) return;

    update((currentPatch) => {
      if (scope === "master") {
        currentPatch.masterGain = Number(input.value);
      } else {
        const operator = currentPatch.operators[Number(input.dataset.operator)];
        if (!operator) return;
        if (scope === "envelope") {
          operator.envelope[key as keyof OperatorSettings["envelope"]] = Number(
            input.value,
          );
        } else if (key === "waveform") {
          operator.waveform = input.value as Waveform;
        } else {
          const numericKey = key as keyof Pick<
            OperatorSettings,
            | "ratio"
            | "fixedHz"
            | "detune"
            | "level"
            | "modulationIndex"
            | "feedback"
          >;
          operator[numericKey] = Number(input.value);
        }
      }
    });
  };
  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const operatorToggle = target.closest<HTMLButtonElement>(
      "[data-operator-toggle]",
    );
    if (operatorToggle) {
      update((currentPatch) => {
        const operator =
          currentPatch.operators[Number(operatorToggle.dataset.operatorToggle)];
        if (operator) operator.enabled = !operator.enabled;
      });
      return;
    }

    const routingButton = target.closest<HTMLButtonElement>(
      "[data-routing-preset]",
    );
    if (routingButton) {
      const preset = getRoutingPreset(
        Number(routingButton.dataset.routingPreset),
      );
      update((currentPatch) => {
        currentPatch.routing = structuredClone(preset.routing);
      });
      return;
    }

    const modeButton = target.closest<HTMLButtonElement>("[data-mode]");
    if (!modeButton) return;
    const mode = modeButton.dataset.mode;
    if (mode !== "ratio" && mode !== "fixed") return;
    update((currentPatch) => {
      const operator =
        currentPatch.operators[Number(modeButton.dataset.operator)];
      if (operator) operator.frequencyMode = mode as FrequencyMode;
    });
  };

  root.addEventListener("input", onInput);
  root.addEventListener("click", onClick);

  return {
    replace: (nextPatch): void => {
      update((currentPatch) => Object.assign(currentPatch, nextPatch));
    },
    update,
    sync,
    dispose: (): void => {
      root.removeEventListener("input", onInput);
      root.removeEventListener("click", onClick);
    },
  };
}
