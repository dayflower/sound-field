import { describe, expect, it } from "vitest";

import { defaultPatch } from "../src/modulate-field/patch";
import { parsePatchJson } from "../src/modulate-field/patch-json";
import { routingMatches } from "../src/modulate-field/routing";

describe("MODULATE / FIELD baseline", () => {
  it("accepts the bundled default patch without changing its schema", () => {
    expect(parsePatchJson(JSON.stringify(defaultPatch))).toEqual(defaultPatch);
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
