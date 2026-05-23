/**
 * Tests for generateNarration: gated behind FULCRUM_FEATURES=report-llm-narration.
 * Uses mocked inference sidecar (no real HTTP calls).
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// We patch the inference-client module before importing generateNarration
// so the fetch is intercepted.

let mockGenerate: ReturnType<typeof mock>;

beforeEach(() => {
  mockGenerate = mock(async (_prompt: string) => ({
    text: "Sprint velocity improved by 20% this cycle.",
    tokens_used: 42,
    model: "llama3",
  }));
});

afterEach(() => {
  delete process.env["FULCRUM_FEATURES"];
});

describe("generateNarration", () => {
  test("flag OFF: returns no-op result without calling sidecar", async () => {
    process.env["FULCRUM_FEATURES"] = "";
    // import after env set
    const { generateNarration } = await import("./reports.ts");
    const result = await generateNarration(
      { projectId: "p1", sprintId: "s1", velocity: 10, completedTasks: 5, blockedTasks: 1, cycleTimeDays: 3 },
      { generateFn: mockGenerate },
    );
    expect(result).toEqual({ skipped: true });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test("flag ON: calls generateFn and returns narrative", async () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
    const { generateNarration } = await import("./reports.ts");
    const result = await generateNarration(
      { projectId: "p1", sprintId: "s1", velocity: 10, completedTasks: 5, blockedTasks: 1, cycleTimeDays: 3 },
      { generateFn: mockGenerate },
    );
    expect(result).toMatchObject({ text: expect.stringContaining("Sprint") });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  test("flag ON + sidecar offline: returns sidecar_unavailable error", async () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
    const offlineFn = mock(async (_p: string) => { throw new Error("ECONNREFUSED"); });
    const { generateNarration } = await import("./reports.ts");
    const result = await generateNarration(
      { projectId: "p1", sprintId: "s1", velocity: 8, completedTasks: 4, blockedTasks: 0, cycleTimeDays: 2 },
      { generateFn: offlineFn },
    );
    expect(result).toEqual({ error: "sidecar_unavailable" });
  });
});
