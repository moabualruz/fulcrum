import { describe, expect, test } from "bun:test";

import {
  buildDependencyRunPreview,
  type DependencyRunPreviewTask,
} from "@execution-orchestration/domain/dependency-run-preview.ts";

function task(
  id: string,
  overrides: Partial<DependencyRunPreviewTask> = {},
): DependencyRunPreviewTask {
  return {
    id,
    title: id,
    column: "todo",
    dependencies: { blocks: [], blocked_by: [] },
    ...overrides,
  };
}

describe("dependency orchestration dependency run preview", () => {
  test("discloses the full dependency tree before running a selected task", () => {
    const preview = buildDependencyRunPreview({
      mode: "task",
      traceId: "trace-1",
      targetTaskIds: ["A"],
      tasks: [
        task("A", { dependencies: { blocks: [], blocked_by: ["B", "C"] } }),
        task("B", { dependencies: { blocks: ["A"], blocked_by: ["D"] } }),
        task("C", { dependencies: { blocks: ["A"], blocked_by: [] } }),
        task("D", { dependencies: { blocks: ["B"], blocked_by: [] } }),
        task("E"),
      ],
    });

    expect(preview.requiresDisclosure).toBe(true);
    expect(preview.traceId).toBe("trace-1");
    expect(preview.orderedTaskIds).toEqual(["D", "B", "C", "A"]);
    expect(preview.tasks.map((item) => ({
      id: item.id,
      selected: item.selected,
      dependencyDepth: item.dependencyDepth,
    }))).toEqual([
      { id: "D", selected: false, dependencyDepth: 2 },
      { id: "B", selected: false, dependencyDepth: 1 },
      { id: "C", selected: false, dependencyDepth: 1 },
      { id: "A", selected: true, dependencyDepth: 0 },
    ]);
    expect(preview.omittedTaskIds).toEqual(["E"]);
    expect(preview.blocked).toBe(false);
  });

  test("keeps deterministic ordering for board-level multi-target runs", () => {
    const preview = buildDependencyRunPreview({
      mode: "board",
      targetTaskIds: ["A", "X"],
      tasks: [
        task("X", { dependencies: { blocks: [], blocked_by: ["Y"] } }),
        task("A", { dependencies: { blocks: [], blocked_by: ["B"] } }),
        task("B", { dependencies: { blocks: ["A"], blocked_by: [] } }),
        task("Y", { dependencies: { blocks: ["X"], blocked_by: [] } }),
      ],
    });

    expect(preview.orderedTaskIds).toEqual(["B", "A", "Y", "X"]);
    expect(preview.tasks.filter((item) => item.selected).map((item) => item.id)).toEqual(["A", "X"]);
  });

  test("blocks preview when dependencies are missing or explicit blockers exist", () => {
    const preview = buildDependencyRunPreview({
      mode: "task",
      targetTaskIds: ["A"],
      tasks: [
        task("A", {
          blockedBy: "waiting for product approval",
          dependencies: { blocks: [], blocked_by: ["B", "MISSING"] },
        }),
        task("B"),
      ],
    });

    expect(preview.blocked).toBe(true);
    expect(preview.missingTaskIds).toEqual(["MISSING"]);
    expect(preview.tasks.find((item) => item.id === "A")?.blockers).toEqual([
      "task is blocked by waiting for product approval",
      "missing dependency: MISSING",
    ]);
    expect(preview.warnings).toEqual([
      "Target A requires 2 prerequisite task(s) before it runs.",
      "Missing dependency MISSING required by A.",
      "Task A is explicitly blocked: task is blocked by waiting for product approval.",
    ]);
  });

  test("reports missing selected tasks without losing known dependency preview", () => {
    const preview = buildDependencyRunPreview({
      mode: "task",
      targetTaskIds: ["A", "UNKNOWN"],
      tasks: [
        task("A", { dependencies: { blocks: [], blocked_by: ["B"] } }),
        task("B"),
      ],
    });

    expect(preview.blocked).toBe(true);
    expect(preview.missingTaskIds).toEqual(["UNKNOWN"]);
    expect(preview.orderedTaskIds).toEqual(["B", "A"]);
    expect(preview.warnings).toContain("Selected task UNKNOWN was not found.");
  });
});
