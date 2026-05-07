import { describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";
import { filterTasksBySprint } from "./kanban-board";
import { buildBoardSnapshot } from "./board-helpers";

const task = (id: string, status: string, sprintId: string | null): BoardTask => ({
  id,
  title: `Task ${id}`,
  status,
  priority: 2,
  project_id: "p1",
  updated_at: "2026-05-01T00:00:00Z",
  sprint_id: sprintId,
});

describe("sprint-scoped board filtering", () => {
  test("board renders only sprint-scoped tasks; unsprinted tasks absent", () => {
    const tasks = [
      task("t1", "pending", "sprint-1"),
      task("t2", "in_progress", "sprint-1"),
      task("t3", "pending", null),
      task("t4", "blocked", "sprint-2"),
    ];

    const filtered = filterTasksBySprint(tasks, "sprint-1");
    expect(filtered.map((t) => t.id)).toEqual(["t1", "t2"]);

    const snap = buildBoardSnapshot(filtered);
    const allIds = Object.values(snap.groups).flatMap((g) => g.map((t) => t.id));
    expect(allIds).toContain("t1");
    expect(allIds).toContain("t2");
    expect(allIds).not.toContain("t3");
    expect(allIds).not.toContain("t4");
  });

  test("quick-add task gets correct sprint_id and column status", () => {
    const newTask: BoardTask = {
      id: "t-new",
      title: "Quick add",
      status: "in_progress",
      priority: 0,
      project_id: "p1",
      updated_at: "2026-05-01T00:00:00Z",
      sprint_id: "sprint-1",
    };

    expect(newTask.sprint_id).toBe("sprint-1");
    expect(newTask.status).toBe("in_progress");

    const filtered = filterTasksBySprint([newTask], "sprint-1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe("t-new");
  });
});
