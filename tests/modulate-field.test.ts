import { describe, expect, it } from "vitest";

import { defaultPatch } from "../src/modulate-field/patch";
import { parsePatchJson } from "../src/modulate-field/patch-json";
import { routingMatches } from "../src/modulate-field/routing";
import { envelopeGraphMarkup } from "../src/modulate-field/ui";

describe("MODULATE / FIELD baseline", () => {
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
