import { describe, expect, it } from "vitest";

import {
  operatorLevelGain,
  opmModulationFrequencyDeviation,
} from "../src/modulate-field/level";
import { defaultPatch } from "../src/modulate-field/patch";
import { parsePatchJson } from "../src/modulate-field/patch-json";
import { createPresetLibrary } from "../src/modulate-field/preset-library";
import { routingMatches } from "../src/modulate-field/routing";
import { envelopeGraphMarkup } from "../src/modulate-field/ui";

describe("MODULATE / FIELD baseline", () => {
  it("spreads the OPM total-level range across one hundred level steps", () => {
    expect(operatorLevelGain(0)).toBe(0);
    expect(operatorLevelGain(1)).toBe(1);
    expect(operatorLevelGain(0.5)).toBeCloseTo(10 ** (-47.625 / 20));
  });

  it("uses the modulator frequency for OPM-scale phase modulation", () => {
    expect(opmModulationFrequencyDeviation(440)).toBeCloseTo(440 * 8 * Math.PI);
  });

  it("accepts the bundled default patch without changing its schema", () => {
    expect(parsePatchJson(JSON.stringify(defaultPatch))).toEqual(defaultPatch);
  });

  it("supports two independently levelled envelope segments", () => {
    const patch = structuredClone(defaultPatch);
    patch.operators[0].envelope.segment1Level = 0.2;
    patch.operators[0].envelope.segment2Level = 0.8;

    const parsed = parsePatchJson(JSON.stringify(patch));
    expect(parsed.operators[0].envelope).toMatchObject({
      segment1Level: 0.2,
      segment2Level: 0.8,
    });
    expect(envelopeGraphMarkup(parsed.operators[0].envelope, 0)).toContain(
      ">S1</text>",
    );
    expect(envelopeGraphMarkup(parsed.operators[0].envelope, 0)).toContain(
      ">S2</text>",
    );
  });

  it("migrates legacy ADSR patch envelopes to a single first segment", () => {
    const legacyPatch = structuredClone(defaultPatch);
    const legacyEnvelope = legacyPatch.operators[0].envelope;
    const legacyJson = JSON.parse(JSON.stringify(legacyPatch)) as {
      operators: { envelope: Record<string, number> }[];
    };
    const legacyOperator = legacyJson.operators[0];
    if (!legacyOperator) throw new Error("Missing first legacy operator");
    legacyOperator.envelope = {
      attack: legacyEnvelope.attack,
      decay: legacyEnvelope.segment1Time,
      sustain: legacyEnvelope.segment1Level,
      release: legacyEnvelope.release,
    };

    expect(
      parsePatchJson(JSON.stringify(legacyJson)).operators[0].envelope,
    ).toEqual({
      attack: legacyEnvelope.attack,
      segment1Time: legacyEnvelope.segment1Time,
      segment1Level: legacyEnvelope.segment1Level,
      segment2Time: 0,
      segment2Level: legacyEnvelope.segment1Level,
      release: legacyEnvelope.release,
    });
  });

  it("matches equivalent routing regardless of connection order", () => {
    expect(
      routingMatches(defaultPatch.routing, {
        connections: [...defaultPatch.routing.connections].reverse(),
      }),
    ).toBe(true);
  });

  it("stores patch, operator, parameters, and envelope presets independently", () => {
    const library = createPresetLibrary();
    const identifier = `${Date.now()}-${Math.random()}`;
    const patchName = `Patch ${identifier}`;
    const operatorName = `Operator ${identifier}`;
    const parametersName = `Parameters ${identifier}`;
    const envelopeName = `Envelope ${identifier}`;
    const patch = structuredClone(defaultPatch);
    patch.masterGain = 0.42;
    const operator = structuredClone(patch.operators[0]);
    operator.level = 0.33;
    const { envelope, ...parameters } = operator;
    const savedEnvelope = structuredClone(envelope);
    savedEnvelope.release = 2.4;

    expect(library.save("patch", patchName, patch)).toBe(true);
    expect(library.save("operator", operatorName, operator)).toBe(true);
    expect(library.save("parameters", parametersName, parameters)).toBe(true);
    expect(library.save("envelope", envelopeName, savedEnvelope)).toBe(true);
    expect(library.save("envelope", envelopeName, savedEnvelope)).toBe(false);

    expect(
      library.list("patch").find((item) => item.name === patchName)?.value,
    ).toEqual(patch);
    expect(
      library.list("operator").find((item) => item.name === operatorName)
        ?.value,
    ).toEqual(operator);
    expect(
      library.list("parameters").find((item) => item.name === parametersName)
        ?.value,
    ).toEqual(parameters);
    expect(
      library.list("envelope").find((item) => item.name === envelopeName)
        ?.value,
    ).toEqual(savedEnvelope);
  });

  it("rejects out-of-range values, duplicate connections, and cycles", () => {
    const outOfRange = structuredClone(defaultPatch);
    outOfRange.masterGain = 1.01;
    expect(() => parsePatchJson(JSON.stringify(outOfRange))).toThrow(
      "masterGain must be a number between 0 and 1.",
    );

    const duplicate = structuredClone(defaultPatch);
    duplicate.routing.connections.push({ from: "op1", to: "op2" });
    expect(() => parsePatchJson(JSON.stringify(duplicate))).toThrow(
      "duplicates",
    );

    const cycle = structuredClone(defaultPatch);
    cycle.routing.connections = [
      { from: "op1", to: "op2" },
      { from: "op2", to: "op1" },
    ];
    expect(() => parsePatchJson(JSON.stringify(cycle))).toThrow(
      "must not contain a cycle",
    );
  });
});
