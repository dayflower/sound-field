import { describe, expect, it } from "vitest";
import {
  ALGORITHMS,
  clonePatch,
  keyRateFactor,
  keyScaleDb,
  normalizePatch,
  type Patch,
  PRESETS,
  pulse,
  routingMatches,
  routingOrder,
} from "../src/modulate-field/core/patch";
import {
  formatPatchFile,
  parsePatchFile,
} from "../src/modulate-field/core/patch-file";

const electricPiano = PRESETS["E.Piano"];
if (!electricPiano) throw new Error("Missing E.Piano preset");

describe("MODULATE / FIELD FM engine", () => {
  it("ships ten playable built-in patches", () => {
    expect(Object.keys(PRESETS)).toHaveLength(10);
    expect(Object.keys(PRESETS).slice(0, 3)).toEqual([
      "Init",
      "Piano",
      "E.Piano",
    ]);
    for (const preset of Object.values(PRESETS)) {
      expect(preset.operators).toHaveLength(4);
      expect(routingOrder(preset.routing)).toHaveLength(4);
      expect(normalizePatch(preset)).toEqual(preset);
    }
  });

  it("matches routing regardless of connection order", () => {
    const routing = ALGORITHMS[4]?.routing;
    if (!routing) throw new Error("Missing DOUBLE routing");
    expect(
      routingMatches(routing, {
        connections: [...routing.connections].reverse(),
      }),
    ).toBe(true);
  });

  it("scales operator level and envelope rate on both sides of the reference note", () => {
    const scale = {
      ...electricPiano.operators[0].keyScale,
      breakPoint: 60,
      leftDepth: -6,
      rightDepth: -12,
      rate: 1,
    };
    expect(keyScaleDb(scale, 48)).toBeCloseTo(-6);
    expect(keyScaleDb(scale, 72)).toBeCloseTo(-12);
    expect(keyRateFactor(scale, 48)).toBeCloseTo(0.5);
    expect(keyRateFactor(scale, 72)).toBeCloseTo(2);
  });

  it("keeps the square wave DC-free at an uneven pulse width", () => {
    const width = 0.25;
    expect(
      width * pulse(0.1, width) + (1 - width) * pulse(0.6, width),
    ).toBeCloseTo(0);
  });

  it("round-trips the patch file and its name", () => {
    const patch = clonePatch(electricPiano);
    patch.lfo.pitchDepth = 24;
    patch.operators[0].keyScale.rightDepth = -9;
    const text = formatPatchFile(patch, "My Piano");
    expect(JSON.parse(text)).toMatchObject({
      format: "modulate-field-patch",
      version: 2,
      name: "My Piano",
    });
    expect(parsePatchFile(text, "fallback")).toEqual({
      name: "My Piano",
      patch,
    });
  });

  it("rejects invalid routing and obsolete file versions", () => {
    const patch: Patch = clonePatch(electricPiano);
    patch.routing.connections = [
      { from: "op1", to: "op2" },
      { from: "op2", to: "op1" },
    ];
    expect(parsePatchFile(JSON.stringify(patch), "Broken")).toEqual({
      error: "patch.routing.connections must not contain a cycle.",
    });
    const oldFile = JSON.parse(formatPatchFile(electricPiano, "Old")) as Record<
      string,
      unknown
    >;
    oldFile.version = 1;
    expect(parsePatchFile(JSON.stringify(oldFile), "Old")).toEqual({
      error: "version must be 2.",
    });
  });
});
