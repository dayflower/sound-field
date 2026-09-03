import { translate as t } from "../shared/i18n";
import { routingMatches, routingPresets } from "./routing";
import type {
  EnvelopeSettings,
  FrequencyMode,
  OperatorId,
  OperatorRouting,
  OperatorSettings,
  SynthPatch,
  Waveform,
} from "./types";

interface SliderDefinition {
  key: keyof Pick<
    OperatorSettings,
    "ratio" | "fixedHz" | "detune" | "level" | "modulationIndex" | "feedback"
  >;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}

const mainSliders: SliderDefinition[] = [
  { key: "ratio", label: "RATIO", min: 0.25, max: 8, step: 0.25, suffix: "×" },
  {
    key: "fixedHz",
    label: "FIXED",
    min: 20,
    max: 2000,
    step: 1,
    suffix: " Hz",
  },
  {
    key: "detune",
    label: "DETUNE",
    min: -100,
    max: 100,
    step: 1,
    suffix: " ct",
  },
  { key: "level", label: "LEVEL", min: 0, max: 1, step: 0.01 },
  { key: "modulationIndex", label: "MOD INDEX", min: 0, max: 20, step: 0.05 },
  { key: "feedback", label: "FEEDBACK", min: 0, max: 10, step: 0.05 },
];

const envelopeSliders = [
  { key: "attack", label: "A", min: 0, max: 2, step: 0.001, suffix: " s" },
  { key: "decay", label: "D", min: 0.01, max: 3, step: 0.01, suffix: " s" },
  { key: "sustain", label: "S", min: 0, max: 1, step: 0.01, suffix: "" },
  { key: "release", label: "R", min: 0, max: 5, step: 0.01, suffix: " s" },
] as const;

function formatNumber(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01)
    return value.toFixed(3).replace(/0+$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function slider(
  operatorIndex: number,
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  suffix = "",
  scope = "operator",
  hidden = false,
): string {
  const displayLabel = scope === "master" ? t("master") : label;
  const labelTranslationKey =
    scope === "master"
      ? "master"
      : scope === "operator"
        ? `controls.${key}`
        : undefined;
  const accessibleLabel =
    scope === "master"
      ? displayLabel
      : `${t("operatorName", operatorIndex + 1)} ${displayLabel}`;
  return `
    <label class="slider-control ${hidden ? "hidden" : ""}" data-control="${key}">
      <span class="control-meta">
        <span${labelTranslationKey ? ` data-i18n="${labelTranslationKey}"` : ""}>${displayLabel}</span>
        <output>${formatNumber(value)}${suffix}</output>
      </span>
      <input
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
        data-operator="${operatorIndex}"
        data-scope="${scope}"
        data-key="${key}"
        data-suffix="${suffix}"
        aria-label="${accessibleLabel}"
      />
    </label>`;
}

export function envelopeGraphMarkup(
  envelope: EnvelopeSettings,
  operatorIndex: number,
): string {
  const left = 10;
  const right = 290;
  const baseline = 76;
  const peak = 9;
  const sustainWidth = 72;
  const timedWidth = right - left - sustainWidth;
  const durationWeight = (value: number, maximum: number) =>
    Math.log1p(value * 10) / Math.log1p(maximum * 10);
  const attackWeight = durationWeight(envelope.attack, 2);
  const decayWeight = durationWeight(envelope.decay, 3);
  const releaseWeight = durationWeight(envelope.release, 5);
  const totalWeight = attackWeight + decayWeight + releaseWeight;
  const attackWidth =
    totalWeight === 0 ? 0 : (timedWidth * attackWeight) / totalWeight;
  const decayWidth =
    totalWeight === 0 ? 0 : (timedWidth * decayWeight) / totalWeight;
  const releaseWidth =
    totalWeight === 0 ? 0 : (timedWidth * releaseWeight) / totalWeight;
  const attackEnd = left + attackWidth;
  const decayEnd = attackEnd + decayWidth;
  const sustainEnd = decayEnd + sustainWidth;
  const graphEnd = sustainEnd + releaseWidth;
  const sustainY = Math.round(baseline - envelope.sustain * (baseline - peak));
  const point = (value: number) => value.toFixed(1);
  const linePath = `M ${left} ${baseline} L ${point(attackEnd)} ${peak} L ${point(decayEnd)} ${sustainY} L ${point(sustainEnd)} ${sustainY} L ${point(graphEnd)} ${baseline}`;
  const areaPath = `${linePath} L ${point(graphEnd)} ${baseline} L ${left} ${baseline} Z`;

  return `
    <svg viewBox="0 0 300 96" role="img" aria-label="${t("envelopeLabel", operatorIndex + 1)}">
      <path class="envelope-area" d="${areaPath}" />
      <g class="envelope-guides">
        <line x1="${point(attackEnd)}" y1="${peak}" x2="${point(attackEnd)}" y2="${baseline}" />
        <line x1="${point(decayEnd)}" y1="${sustainY}" x2="${point(decayEnd)}" y2="${baseline}" />
        <line x1="${point(sustainEnd)}" y1="${sustainY}" x2="${point(sustainEnd)}" y2="${baseline}" />
      </g>
      <path class="envelope-line" d="${linePath}" />
      <line class="envelope-sustain-line" x1="${point(decayEnd)}" y1="${sustainY}" x2="${point(sustainEnd)}" y2="${sustainY}" />
      <g class="envelope-points">
        <circle cx="${point(attackEnd)}" cy="${peak}" r="2.5" />
        <circle cx="${point(decayEnd)}" cy="${sustainY}" r="2.5" />
        <circle cx="${point(sustainEnd)}" cy="${sustainY}" r="2.5" />
      </g>
      <g class="envelope-labels">
        <text x="${point((left + attackEnd) / 2)}" y="91">A</text>
        <text x="${point((attackEnd + decayEnd) / 2)}" y="91">D</text>
        <text x="${point((decayEnd + sustainEnd) / 2)}" y="91">S</text>
        <text x="${point((sustainEnd + graphEnd) / 2)}" y="91">R</text>
      </g>
    </svg>`;
}

function operatorPanel(operator: OperatorSettings, index: number): string {
  const frequencySliders = mainSliders
    .map(({ key, min, max, step, suffix }) => {
      const hidden =
        (key === "fixedHz" && operator.frequencyMode !== "fixed") ||
        (key === "ratio" && operator.frequencyMode !== "ratio");
      return slider(
        index,
        key,
        t(`controls.${key}`),
        operator[key],
        min,
        max,
        step,
        suffix,
        "operator",
        hidden,
      );
    })
    .join("");
  const envelope = envelopeSliders
    .map(({ key, label, min, max, step, suffix }) =>
      slider(
        index,
        key,
        label,
        operator.envelope[key],
        min,
        max,
        step,
        suffix ?? "",
        "envelope",
      ),
    )
    .join("");

  return `
    <section class="operator ${operator.enabled ? "" : "disabled"}" data-operator-panel="${index}">
      <header class="operator-header">
        <span class="operator-index">0${index + 1}</span>
        <div><span class="eyebrow" data-i18n="operator">${t("operator")}</span><h2>${t("operatorName", index + 1)}</h2></div>
        <div class="operator-status">
          <span class="signal-led" aria-hidden="true"></span>
          <button type="button" class="operator-toggle ${operator.enabled ? "active" : ""}" data-operator-toggle="${index}" aria-label="${t("operatorPower", index + 1)}" aria-pressed="${operator.enabled}">
            <span class="toggle-track" aria-hidden="true"><i></i></span>
            <span data-operator-toggle-label data-i18n="${operator.enabled ? "on" : "off"}">${operator.enabled ? t("on") : t("off")}</span>
          </button>
        </div>
      </header>

      <div class="control-block">
        <label class="select-control">
          <span data-i18n="waveform">${t("waveform")}</span>
          <select data-operator="${index}" data-scope="operator" data-key="waveform" aria-label="${t("operatorName", index + 1)} ${t("waveform")}">
            ${(
              [
                "sine",
                "triangle",
                "sawtooth",
                "square",
                "white",
              ] satisfies Waveform[]
            )
              .map(
                (wave) =>
                  `<option value="${wave}" ${wave === operator.waveform ? "selected" : ""}>${wave.toUpperCase()}</option>`,
              )
              .join("")}
          </select>
        </label>

        <div class="mode-switch" role="group" aria-label="${t("frequencyMode", index + 1)}">
          ${(["ratio", "fixed"] satisfies FrequencyMode[])
            .map(
              (mode) =>
                `<button type="button" data-mode="${mode}" data-operator="${index}" data-i18n="controls.${mode === "fixed" ? "fixedHz" : "ratio"}" class="${mode === operator.frequencyMode ? "active" : ""}">${t(`controls.${mode === "fixed" ? "fixedHz" : "ratio"}`)}</button>`,
            )
            .join("")}
        </div>
      </div>

      <div class="control-block frequency-controls">${frequencySliders}</div>

      <div class="control-block envelope-block">
        <div class="block-heading"><span data-i18n="amplitudeEnvelope">${t("amplitudeEnvelope")}</span><span>ADSR</span></div>
        ${envelope}
        <div class="envelope-graph" data-envelope-graph="${index}">${envelopeGraphMarkup(operator.envelope, index)}</div>
      </div>
    </section>`;
}

const operatorIds: OperatorId[] = ["op1", "op2", "op3", "op4"];

function automaticDiagram(
  routing: OperatorRouting,
): Record<OperatorId, readonly [number, number]> {
  const incoming = new Map<OperatorId, number>(
    operatorIds.map((operatorId) => [operatorId, 0]),
  );
  const outgoing = new Map<OperatorId, OperatorId[]>(
    operatorIds.map((operatorId) => [operatorId, []]),
  );
  for (const { from, to } of routing.connections) {
    if (to === "output") continue;
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
    outgoing.get(from)?.push(to);
  }

  const levels = new Map<OperatorId, number>(
    operatorIds.map((operatorId) => [operatorId, 0]),
  );
  const queue = operatorIds.filter(
    (operatorId) => incoming.get(operatorId) === 0,
  );
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const operatorId = queue[cursor];
    if (!operatorId) continue;
    const level = levels.get(operatorId) ?? 0;
    for (const target of outgoing.get(operatorId) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, level + 1));
      const remaining = (incoming.get(target) ?? 1) - 1;
      incoming.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  const maxLevel = Math.max(...levels.values());
  const diagram = {} as Record<OperatorId, readonly [number, number]>;
  for (let level = 0; level <= maxLevel; level += 1) {
    const operators = operatorIds.filter(
      (operatorId) => levels.get(operatorId) === level,
    );
    operators.forEach((operatorId, index) => {
      const x = maxLevel === 0 ? 42 : 12 + (level / maxLevel) * 68;
      const y = (48 * (index + 1)) / (operators.length + 1);
      diagram[operatorId] = [x, y];
    });
  }
  return diagram;
}

function routingDiagram(
  routing: OperatorRouting,
  diagram: Record<OperatorId, readonly [number, number]> = automaticDiagram(
    routing,
  ),
): string {
  const connections = routing.connections
    .filter(({ to }) => to !== "output")
    .map(({ from, to }) => {
      if (to === "output") return "";
      const [sourceX, sourceY] = diagram[from];
      const [targetX, targetY] = diagram[to];
      const startX = sourceX + 5;
      const endX = targetX - 5;
      const middleX = (startX + endX) / 2;
      const path =
        sourceY === targetY
          ? `M ${startX} ${sourceY} H ${endX}`
          : `M ${startX} ${sourceY} H ${middleX} V ${targetY} H ${endX}`;
      return `<path d="${path}" />`;
    })
    .join("");
  const outputs = routing.connections
    .filter(({ to }) => to === "output")
    .map(({ from }) => {
      const [x, y] = diagram[from];
      return `<line x1="${x + 5}" y1="${y}" x2="92" y2="${y}" /><path class="routing-output-arrow" d="M 96 ${y} L 91 ${y - 2.5} L 91 ${y + 2.5} Z" />`;
    })
    .join("");
  const nodes = operatorIds
    .map((operatorId) => {
      const [x, y] = diagram[operatorId];
      return `<g transform="translate(${x} ${y})"><rect x="-5" y="-5" width="10" height="10" /><text y="2.2">${operatorId.slice(2)}</text></g>`;
    })
    .join("");

  return `<svg class="routing-diagram" viewBox="0 0 100 48" aria-hidden="true"><g class="routing-connections">${connections}</g><g class="routing-outputs">${outputs}</g><g class="routing-nodes">${nodes}</g></svg>`;
}

function routingPresetButtons(activeRouting: OperatorRouting): string {
  return routingPresets
    .map(
      ({ id, label, formula, routing, diagram }) => `
        <button type="button" class="routing-button ${routingMatches(routing, activeRouting) ? "active" : ""}" data-routing-preset="${id}" aria-label="${label}: ${formula}" aria-pressed="${routingMatches(routing, activeRouting)}">
          ${routingDiagram(routing, diagram)}
          <span class="routing-label">${label}</span>
        </button>`,
    )
    .join("");
}

export function routingMarkup(activeRouting: OperatorRouting): string {
  const isPreset = routingPresets.some(({ routing }) =>
    routingMatches(routing, activeRouting),
  );
  return `
    <div class="routing-grid" data-routing-grid>${routingPresetButtons(activeRouting)}</div>
    <div data-custom-routing>${
      isPreset
        ? ""
        : `<div class="custom-routing" role="img" aria-label="${t("customRoutingDiagram")}">${routingDiagram(activeRouting)}<span class="routing-label" data-i18n="customRouting">${t("customRouting")}</span></div>`
    }</div>`;
}

const keyPattern = [
  { offset: 0, name: "C", black: false },
  { offset: 1, name: "C#", black: true },
  { offset: 2, name: "D", black: false },
  { offset: 3, name: "D#", black: true },
  { offset: 4, name: "E", black: false },
  { offset: 5, name: "F", black: false },
  { offset: 6, name: "F#", black: true },
  { offset: 7, name: "G", black: false },
  { offset: 8, name: "G#", black: true },
  { offset: 9, name: "A", black: false },
  { offset: 10, name: "A#", black: true },
  { offset: 11, name: "B", black: false },
] as const;

const computerLabels: Record<number, string> = {
  0: "A",
  1: "W",
  2: "S",
  3: "E",
  4: "D",
  5: "F",
  6: "T",
  7: "G",
  8: "Y",
  9: "H",
  10: "U",
  11: "J",
  12: "K",
};

export function keyboardMarkup(octave = 4): string {
  const keys = [
    ...keyPattern,
    ...keyPattern.map((key) => ({ ...key, offset: key.offset + 12 })),
  ]
    .concat([{ offset: 24, name: "C", black: false }])
    .map(({ offset, name, black }) => {
      const noteOctave = octave + Math.floor(offset / 12);
      const note = `${name}${noteOctave}`;
      const label = computerLabels[offset] ?? "";
      return `<button type="button" class="piano-key ${black ? "black" : "white"}" data-note="${note}" data-offset="${offset}" aria-label="${note}"><span>${label}</span><small>${name === "C" ? note : ""}</small></button>`;
    })
    .join("");
  return `<div class="piano-keys">${keys}</div>`;
}

export function renderApp(root: HTMLElement, patch: SynthPatch): void {
  root.innerHTML = `
    <main class="app-shell">
      <header class="site-header">
        <a class="brand" href="./index.html" aria-label="${t("homeLabel")}">
          <span class="brand-mark">M/F</span><span>MODULATE / FIELD</span>
        </a>
        <div class="header-side">
          <a class="back-link" href="./index.html" data-i18n="backLabel">${t("backLabel")}</a>
          <p class="header-note">REALTIME AUDIO LAB<br />TOKYO — <span id="clock">00:00:00</span></p>
          <label class="language-picker"><select data-language-select></select></label>
        </div>
      </header>
      <section class="field-intro">
        <span data-i18n="introSynthesis">${t("introSynthesis")}</span><span data-i18n="introLead">${t("introLead")}</span>
      </section>
      <div class="workspace-grid">
        <div class="performance-column">
          <section class="monitor-strip">
        <div class="scope-panel"><div class="monitor-label"><span data-i18n="oscilloscope">${t("oscilloscope")}</span><span data-i18n="time">${t("time")}</span></div><canvas data-scope-canvas></canvas></div>
        <div class="scope-panel spectrum"><div class="monitor-label"><span data-i18n="spectrum">${t("spectrum")}</span><span data-i18n="frequency">${t("frequency")}</span></div><canvas data-spectrum-canvas></canvas></div>
        <div class="voice-readout"><span class="eyebrow" data-i18n="activeVoices">${t("activeVoices")}</span><strong data-voice-count>0</strong><small>/ 8</small></div>
          </section>
          <section class="synth-controls" aria-label="${t("synthControls")}">
          <div class="audio-status"><i></i><span data-audio-status data-i18n="audioSuspended">${t("audioSuspended")}</span></div>
          ${slider(-1, "masterGain", "MASTER", patch.masterGain, 0, 1, 0.01, "", "master")}
          <button type="button" class="outline-button" data-json-button data-i18n="patchJson">${t("patchJson")}</button>
          </section>

          <section class="keyboard-section">
        <div class="keyboard-toolbar">
          <div><span class="eyebrow" data-i18n="polyphony">${t("polyphony")}</span><h2 data-i18n="keyboard">${t("keyboard")}</h2></div>
          <div class="octave-control"><button type="button" data-octave-down aria-label="${t("octaveDown")}">−</button><span><span data-i18n="octave">${t("octave")}</span> <strong data-octave>4</strong></span><button type="button" data-octave-up aria-label="${t("octaveUp")}">+</button></div>
          <p data-i18n="keyboardHint" data-i18n-html>${t("keyboardHint")}</p>
        </div>
        <div class="keyboard-wrap" data-keyboard>${keyboardMarkup()}</div>
          </section>
        </div>

        <div class="synthesis-column">
          <section class="routing-section">
            <div class="section-heading"><div><span class="eyebrow" data-i18n="connectionPresets">${t("connectionPresets")}</span><h2 data-i18n="routing">${t("routing")}</h2></div><p data-i18n="routingDescription">${t("routingDescription")}</p></div>
            <div data-routing-controls>${routingMarkup(patch.routing)}</div>
          </section>

          <section class="operators-grid">${patch.operators.map(operatorPanel).join("")}</section>
        </div>
      </div>
      <footer><span>MODULATE / FIELD / REV 0.1</span><span data-i18n="footer">${t("footer")}</span></footer>
    </main>

    <dialog class="json-dialog" data-json-dialog>
      <div class="dialog-heading"><div><span class="eyebrow" data-i18n="importExport">${t("importExport")}</span><h2 data-i18n="patchJson">${t("patchJson")}</h2></div><button type="button" data-json-close aria-label="${t("close")}">×</button></div>
      <label class="json-input-label"><span data-i18n="schemaHint">${t("schemaHint")}</span><textarea data-json-input spellcheck="false" aria-label="${t("patchJson")}"></textarea></label>
      <p class="json-status" data-json-status role="status" aria-live="polite"></p>
      <div class="dialog-footer"><span data-i18n="pasteHint">${t("pasteHint")}</span><div><button type="button" class="outline-button" data-json-copy data-i18n="copy">${t("copy")}</button><button type="button" class="outline-button" data-json-load data-i18n="load">${t("load")}</button></div></div>
    </dialog>
  `;
}

export { formatNumber };
