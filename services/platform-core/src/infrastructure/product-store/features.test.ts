import { describe, expect, test } from "bun:test";
import {
  getFeatureBackend,
  isFeatureEnabled,
  parseFeatures,
} from "./features.ts";

describe("features", () => {
  test("parseFeatures returns empty for undefined/empty", () => {
    expect(parseFeatures()).toEqual([]);
    expect(parseFeatures("")).toEqual([]);
    expect(parseFeatures("  ")).toEqual([]);
  });

  test("parseFeatures parses comma-separated flags", () => {
    const flags = parseFeatures("embeddings,report-llm-narration");
    expect(flags).toEqual([
      { name: "embeddings", backend: null },
      { name: "report-llm-narration", backend: null },
    ]);
  });

  test("parseFeatures extracts backend hint after colon", () => {
    const flags = parseFeatures("report-llm-narration:ollama");
    expect(flags).toEqual([
      { name: "report-llm-narration", backend: "ollama" },
    ]);
  });

  test("parseFeatures handles mixed flags with and without backends", () => {
    const flags = parseFeatures(
      "embeddings, report-llm-narration:openai-compatible",
    );
    expect(flags).toHaveLength(2);
    expect(flags[0]).toEqual({ name: "embeddings", backend: null });
    expect(flags[1]).toEqual({
      name: "report-llm-narration",
      backend: "openai-compatible",
    });
  });

  test("isFeatureEnabled returns true/false", () => {
    const flags = parseFeatures("embeddings,report-llm-narration:ollama");
    expect(isFeatureEnabled(flags, "embeddings")).toBe(true);
    expect(isFeatureEnabled(flags, "report-llm-narration")).toBe(true);
    expect(isFeatureEnabled(flags, "other")).toBe(false);
  });

  test("getFeatureBackend returns backend or null", () => {
    const flags = parseFeatures("embeddings,report-llm-narration:ollama");
    expect(getFeatureBackend(flags, "embeddings")).toBeNull();
    expect(getFeatureBackend(flags, "report-llm-narration")).toBe("ollama");
    expect(getFeatureBackend(flags, "missing")).toBeNull();
  });
});
