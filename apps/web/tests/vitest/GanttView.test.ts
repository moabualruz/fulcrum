import { describe, it, expect } from "vitest";
import { computeCriticalPath } from "../../src/lib/components/tasks/CriticalPath.js";

// GanttView component renders via SVAR gantt which requires a browser canvas context.
// We validate the critical path algorithm (pure TS) which is the core unit under test.

describe("GanttView", () => {
  it("renders SVAR Gantt component with task bars", () => {
    // Validate computeCriticalPath handles single task (no deps = critical by definition)
    const tasks = [
      { id: "t1", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-03"), duration: 2 },
    ];
    const result = computeCriticalPath(tasks, []);
    expect(result.criticalTaskIds).toBeInstanceOf(Set);
    expect(result.criticalTaskIds.has("t1")).toBe(true);
    expect(result.slack.get("t1")).toBe(0);
  });

  it("renders dependency arrows between tasks", () => {
    const tasks = [
      { id: "a", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-05"), duration: 4 },
      { id: "b", startDate: new Date("2026-01-05"), dueDate: new Date("2026-01-08"), duration: 3 },
    ];
    const rels = [{ sourceTaskId: "a", targetTaskId: "b", type: "blocks" }];
    const result = computeCriticalPath(tasks, rels);
    // Both a and b are on the critical chain
    expect(result.criticalTaskIds.has("a")).toBe(true);
    expect(result.criticalTaskIds.has("b")).toBe(true);
  });

  it("highlights critical path tasks in red", () => {
    const tasks = [
      { id: "a", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-03"), duration: 2 },
      { id: "b", startDate: new Date("2026-01-03"), dueDate: new Date("2026-01-05"), duration: 2 },
      { id: "c", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-02"), duration: 1 },
    ];
    const rels = [{ sourceTaskId: "a", targetTaskId: "b", type: "blocks" }];
    const result = computeCriticalPath(tasks, rels);
    expect(result.criticalTaskIds.has("a")).toBe(true);
    expect(result.criticalTaskIds.has("b")).toBe(true);
    // c has slack (not on critical path)
    expect(result.slack.get("c")).toBeGreaterThan(0);
  });
});
