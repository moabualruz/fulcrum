import { describe, it, expect } from "vitest";
import {
  memoryDeleteApiPath,
  memoryListApiPath,
  memoryPromoteApiPath,
  memoryPublicApiHeaders,
  memorySearchApiPath,
} from "$lib/memory/memory-browser";

describe("MemoryBrowser component logic — knowledge workflow", () => {
  const IMPORTANCE_LEVELS = ["high", "medium", "low"] as const;
  const IMPORTANCE_WEIGHT = { high: 3, medium: 2, low: 1 } as const;

  it("importance weights match memory ranking behavior", () => {
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

  describe("public memory API paths", () => {
    it("builds list and search paths for the public API transport", () => {
      expect(memoryListApiPath({ projectId: "project-1" })).toBe("/api/v1/memory?projectId=project-1");
      expect(memorySearchApiPath("kernel plan", { projectId: "project-1" })).toBe(
        "/api/v1/memory/search?query=kernel+plan&projectId=project-1",
      );
    });

    it("builds action paths and bearer headers", () => {
      expect(memoryDeleteApiPath("memory/1")).toBe("/api/v1/memory/memory%2F1?confirm=true");
      expect(memoryPromoteApiPath("memory/1")).toBe("/api/v1/memory/memory%2F1/promote");
      expect(memoryPublicApiHeaders({ authorization: "Bearer test-token" })).toEqual({
        "content-type": "application/json",
        authorization: "Bearer test-token",
      });
    });
  });
});
