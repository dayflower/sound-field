import { describe, expect, it } from "vitest";

import { isPageId, translateFor, translateListFor } from "../src/shared/i18n";

describe("i18n contract", () => {
  it("resolves common keys independently of the active page", () => {
    expect(translateFor("en", "modulate", "common.languageLabel")).toBe(
      "Language",
    );
    expect(translateFor("ja", "spectrum", "common.languageLabel")).toBe("言語");
  });

  it("keeps string and list translations in separate APIs", () => {
    expect(translateFor("ja", "modulate", "audioActive")).toBe(
      "オーディオ有効",
    );
    expect(translateListFor("en", "noise", "presets.white")).toEqual([
      "White",
      "Equal strength across all frequencies",
    ]);
    expect(translateListFor("en", "noise", "start")).toEqual([]);
  });

  it("falls back predictably when a translation key is missing", () => {
    expect(translateFor("en", "index", "missing.key")).toBe("missing.key");
    expect(translateListFor("en", "index", "missing.key")).toEqual([]);
  });

  it("accepts only declared page IDs", () => {
    expect(isPageId("modulate")).toBe(true);
    expect(isPageId("unknown")).toBe(false);
  });
});
