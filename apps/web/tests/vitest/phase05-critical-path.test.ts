import { describe, it, expect } from "vitest";
import { computeCriticalPath, CriticalPathCache } from "../../src/lib/components/tasks/CriticalPath.js";

describe("CriticalPath — Phase 05 CPM", () => {
  it("empty input returns empty sets", () => {
    const result = computeCriticalPath([], []);
    expect(result.criticalTaskIds.size).toBe(0);
    expect(result.slack.size).toBe(0);
  });

  it("diamond dependency graph identifies longest path", () => {
    // A→B (3d), A→C (1d), B→D, C→D — critical path is A→B→D
    const tasks = [
      { id: "A", startDate: null, dueDate: null, duration: 2 },
      { id: "B", startDate: null, dueDate: null, duration: 3 },
      { id: "C", startDate: null, dueDate: null, duration: 1 },
      { id: "D", startDate: null, dueDate: null, duration: 2 },
    ];
    const rels = [
      { sourceTaskId: "A", targetTaskId: "B", type: "blocks" },
      { sourceTaskId: "A", targetTaskId: "C", type: "blocks" },
      { sourceTaskId: "B", targetTaskId: "D", type: "blocks" },
      { sourceTaskId: "C", targetTaskId: "D", type: "blocks" },
    ];
    const result = computeCriticalPath(tasks, rels);
    expect(result.criticalTaskIds.has("A")).toBe(true);
    expect(result.criticalTaskIds.has("B")).toBe(true);
    expect(result.criticalTaskIds.has("D")).toBe(true);
    // C has slack (shorter path)
    expect(result.slack.get("C")).toBeGreaterThan(0);
  });

  it("disconnected subgraphs each have own critical path", () => {
    const tasks = [
      { id: "X1", startDate: null, dueDate: null, duration: 5 },
      { id: "X2", startDate: null, dueDate: null, duration: 3 },
      { id: "Y1", startDate: null, dueDate: null, duration: 2 },
    ];
    const rels = [{ sourceTaskId: "X1", targetTaskId: "X2", type: "blocks" }];
    const result = computeCriticalPath(tasks, rels);
    // X1→X2 chain is 8 days, Y1 is 2 days alone
    expect(result.criticalTaskIds.has("X1")).toBe(true);
    expect(result.criticalTaskIds.has("X2")).toBe(true);
    // Y1 has slack relative to project end (8 days)
    expect(result.slack.get("Y1")).toBeGreaterThan(0);
  });

  it("circular dependency does not infinite loop (graceful degradation)", () => {
    const tasks = [
      { id: "A", startDate: null, dueDate: null, duration: 2 },
      { id: "B", startDate: null, dueDate: null, duration: 2 },
      { id: "C", startDate: null, dueDate: null, duration: 2 },
    ];
    // A→B→C→A cycle
    const rels = [
      { sourceTaskId: "A", targetTaskId: "B", type: "blocks" },
      { sourceTaskId: "B", targetTaskId: "C", type: "blocks" },
      { sourceTaskId: "C", targetTaskId: "A", type: "blocks" },
    ];
    // Should not hang — returns partial result
    const result = computeCriticalPath(tasks, rels);
    expect(result.slack).toBeInstanceOf(Map);
  });

  it("ignores non-blocks relationship types", () => {
    const tasks = [
      { id: "A", startDate: null, dueDate: null, duration: 3 },
      { id: "B", startDate: null, dueDate: null, duration: 2 },
    ];
    const rels = [{ sourceTaskId: "A", targetTaskId: "B", type: "related_to" }];
    const result = computeCriticalPath(tasks, rels);
    // No dependency edge — treated as independent; A is longest so critical
    expect(result.criticalTaskIds.has("A")).toBe(true);
    // B is shorter, has slack relative to project end
    expect(result.slack.get("B")).toBeGreaterThan(0);
  });

  it("CriticalPathCache returns same result for same reference", () => {
    const cache = new CriticalPathCache();
    const tasks = [{ id: "t1", startDate: null, dueDate: null, duration: 5 }];
    const rels: [] = [];
    const r1 = cache.get(tasks, rels);
    const r2 = cache.get(tasks, rels);
    expect(r1).toBe(r2); // same object reference
  });

  it("CriticalPathCache recomputes on new reference", () => {
    const cache = new CriticalPathCache();
    const tasks = [{ id: "t1", startDate: null, dueDate: null, duration: 5 }];
    const r1 = cache.get(tasks, []);
    const r2 = cache.get([...tasks], []);
    expect(r1).not.toBe(r2);
    expect(r2.criticalTaskIds.has("t1")).toBe(true);
  });
});
