import { describe, expect, it } from "vitest";
import { createAllTuiViews, createTuiView, renderTuiView } from "../../apps/tui/src/views/index.js";

describe("terminal dashboard/TUI surface parity", () => {
  it("covers every SRS terminal dashboard view", () => {
    expect(Object.keys(createAllTuiViews())).toEqual([
      "dashboard",
      "projects",
      "tasks",
      "runs",
      "worktrees",
      "artifacts",
      "context-packs",
      "quality-gates",
      "doctor",
      "events"
    ]);
  });

  it("renders stable non-color health and record output for cross-surface comparison", () => {
    const output = renderTuiView(
      createTuiView("tasks", [
        { id: "task_1", label: "Fix contract", status: "ready", detail: "proj_1" }
      ])
    );

    expect(output).toContain("Tasks [managed]");
    expect(output).toContain("task_1 | Fix contract | ready | proj_1");
  });
});
