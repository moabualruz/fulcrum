import { describe, expect, test } from "bun:test";
import { parseFeatureFlags, isFeatureEnabled, PILLAR8_FLAGS } from "./feature-flags.ts";

describe("feature flags", () => {
  test("no flags active when FULCRUM_FEATURES unset", () => {
    const flags = parseFeatureFlags(undefined);
    expect(flags.size).toBe(0);
  });

  test("no flags active when FULCRUM_FEATURES is empty", () => {
    const flags = parseFeatureFlags("");
    expect(flags.size).toBe(0);
  });

  test("parses single flag", () => {
    const flags = parseFeatureFlags("embeddings");
    expect(flags.has("embeddings")).toBe(true);
    expect(flags.size).toBe(1);
  });

  test("parses multiple comma-separated flags", () => {
    const flags = parseFeatureFlags("embeddings,llm-extraction,report-narration");
    expect(flags.size).toBe(3);
    expect(flags.has("embeddings")).toBe(true);
    expect(flags.has("llm-extraction")).toBe(true);
    expect(flags.has("report-narration")).toBe(true);
  });

  test("ignores unknown flags", () => {
    const flags = parseFeatureFlags("embeddings,unknown-flag,llm-extraction");
    expect(flags.size).toBe(2);
    expect(flags.has("embeddings")).toBe(true);
    expect(flags.has("llm-extraction")).toBe(true);
  });

  test("trims whitespace around flags", () => {
    const flags = parseFeatureFlags(" embeddings , llm-extraction ");
    expect(flags.size).toBe(2);
  });

  test("isFeatureEnabled returns false when env unset", () => {
    expect(isFeatureEnabled("embeddings", undefined)).toBe(false);
    expect(isFeatureEnabled("llm-extraction", undefined)).toBe(false);
    expect(isFeatureEnabled("report-narration", undefined)).toBe(false);
  });

  test("isFeatureEnabled returns true when flag in env", () => {
    expect(isFeatureEnabled("embeddings", "embeddings,llm-extraction")).toBe(true);
  });

  test("PILLAR8_FLAGS contains exactly three gated features", () => {
    expect(PILLAR8_FLAGS).toEqual(["embeddings", "llm-extraction", "report-narration"]);
  });
});
