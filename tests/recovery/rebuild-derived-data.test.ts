import { describe, expect, it } from "vitest";
import { RebuildOrchestrator } from "@fulcrum/core";

describe("rebuild derived data", () => {
  it("rebuilds available derived data and marks missing sources degraded", () => {
    const result = new RebuildOrchestrator().rebuild({
      indexes: 2,
      projections: 3,
      code_refs: 4
    });

    expect(result.preservedCanonicalState).toBe(true);
    expect(result.steps.map((step) => step.name)).toEqual([
      "indexes",
      "projections",
      "repo_maps",
      "memory_indexes",
      "code_refs",
      "context_previews"
    ]);
    expect(result.steps.find((step) => step.name === "code_refs")).toMatchObject({
      status: "rebuilt",
      source: "canonical",
      rebuiltCount: 4
    });
    expect(result.steps.find((step) => step.name === "memory_indexes")).toMatchObject({
      status: "degraded",
      source: "unavailable"
    });
  });
});
