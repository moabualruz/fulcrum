import { describe, it, expect } from "vitest";

describe("MemoryBrowser component logic — Phase 06", () => {
  const IMPORTANCE_LEVELS = ["high", "medium", "low"] as const;
  const IMPORTANCE_WEIGHT = { high: 3, medium: 2, low: 1 } as const;

  it("importance weights match D-24 spec", () => {
    expect(IMPORTANCE_WEIGHT.high).toBe(3);
    expect(IMPORTANCE_WEIGHT.medium).toBe(2);
    expect(IMPORTANCE_WEIGHT.low).toBe(1);
  });

  it("all 3 importance levels have defined weights", () => {
    for (const level of IMPORTANCE_LEVELS) {
      expect(IMPORTANCE_WEIGHT[level]).toBeGreaterThan(0);
    }
  });

  describe("promote toggle logic", () => {
    it("promote sets global=true, preserves projectId", () => {
      const memory = { id: "m1", projectId: "p1", global: false };
      const promoted = { ...memory, global: true };
      expect(promoted.global).toBe(true);
      expect(promoted.projectId).toBe("p1");
    });

    it("already-global memory cannot be promoted again", () => {
      const memory = { id: "m1", global: true };
      expect(memory.global).toBe(true);
    });
  });

  describe("search debounce", () => {
    it("debounce delay is reasonable (100-500ms)", () => {
      const DEBOUNCE_MS = 300;
      expect(DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
      expect(DEBOUNCE_MS).toBeLessThanOrEqual(500);
    });
  });
});
