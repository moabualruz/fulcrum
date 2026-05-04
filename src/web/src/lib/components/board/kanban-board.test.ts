import { describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";
import {
  applyBoardMove,
  buildSwimlanes,
  filterTasksBySprint,
  measureBoardSnapshot,
  revertBoardMove,
} from "./kanban-board";

const task = (id: string, status: string, extra: Partial<BoardTask> = {}): BoardTask => ({
  id,
  title: `Task ${id}`,
  status,
  priority: 2,
  project_id: "project-1",
  updated_at: `2026-01-01T00:00:${id.padStart(2, "0")}Z`,
  ...extra,
});

describe("kanban board helpers", () => {
  test("groups swimlanes by assignee and keeps unassigned tasks visible", () => {
    const lanes = buildSwimlanes([task("1", "pending", { assignee: "Maya" }), task("2", "blocked")], "assignee");

    expect(lanes.map((lane) => lane.id)).toEqual(["Maya", "unassigned"]);
    expect(lanes[0]?.tasks.map((item) => item.id)).toEqual(["1"]);
    expect(lanes[1]?.label).toBe("Unassigned");
  });

  test("groups swimlanes by priority with stable labels", () => {
    const lanes = buildSwimlanes([task("1", "pending", { priority: 5 }), task("2", "blocked", { priority: 1 })], "priority");

    expect(lanes.map((lane) => lane.label)).toEqual(["P5", "P1"]);
  });

  test("filters active sprint, backlog, and all tasks", () => {
    const tasks = [
      task("1", "pending", { sprint_id: "sprint-1" }),
      task("2", "pending", { sprint_id: null }),
      task("3", "pending", { sprint_id: "sprint-2" }),
    ];

    expect(filterTasksBySprint(tasks, "all").map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(filterTasksBySprint(tasks, "backlog").map((item) => item.id)).toEqual(["2"]);
    expect(filterTasksBySprint(tasks, "sprint-1").map((item) => item.id)).toEqual(["1"]);
  });

  test("optimistic move can revert to original column on update failure", () => {
    const tasks = [task("1", "pending"), task("2", "blocked")];
    const moved = applyBoardMove(tasks, { taskId: "1", fromStatus: "pending", toStatus: "completed" });

    expect(moved.find((item) => item.id === "1")?.status).toBe("completed");

    const reverted = revertBoardMove(moved, { taskId: "1", fromStatus: "pending", toStatus: "completed" });
    expect(reverted.find((item) => item.id === "1")?.status).toBe("pending");
  });

  test("builds 200 task board snapshot under 300ms", () => {
    const tasks = Array.from({ length: 200 }, (_, index) =>
      task(String(index), index % 2 === 0 ? "pending" : "in_progress", { priority: index % 5 }),
    );

    const measurement = measureBoardSnapshot(tasks);

    expect(measurement.taskCount).toBe(200);
    expect(measurement.durationMs).toBeLessThan(300);
  });
});
