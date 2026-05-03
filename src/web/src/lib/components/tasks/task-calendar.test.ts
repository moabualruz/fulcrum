import { describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";
import {
  applyCalendarReschedule,
  buildCalendarMonth,
  buildSprintBandCells,
  revertCalendarReschedule,
  tasksForDate,
  unscheduledTasks,
} from "./task-calendar";

const task = (id: string, due_date: string | null, title = `Task ${id}`): BoardTask => ({
  id,
  title,
  status: "pending",
  priority: 1,
  project_id: "project-1",
  updated_at: "2026-05-01T00:00:00.000Z",
  due_date,
});

describe("task calendar helpers", () => {
  test("renders tasks on correct date cells for a 3-task fixture", () => {
    const tasks = [
      task("a", "2026-05-03", "Write spec"),
      task("b", "2026-05-17", "Ship calendar"),
      task("c", "2026-06-01", "Next month"),
    ];

    const month = buildCalendarMonth("2026-05-15");

    expect(tasksForDate(tasks, "2026-05-03").map((item) => item.title)).toEqual(["Write spec"]);
    expect(tasksForDate(tasks, "2026-05-17").map((item) => item.title)).toEqual(["Ship calendar"]);
    expect(month.cells.find((cell) => cell.date === "2026-06-01")?.inMonth).toBe(false);
  });

  test("separates tasks without due_date into unscheduled list", () => {
    const tasks = [task("a", "2026-05-03"), task("b", null, "Backlog task")];

    expect(unscheduledTasks(tasks).map((item) => item.title)).toEqual(["Backlog task"]);
  });

  test("reschedule helpers apply due_date optimistically and revert on error", () => {
    const tasks = [task("a", "2026-05-03")];
    const move = { taskId: "a", fromDate: "2026-05-03", toDate: "2026-05-10" };

    const moved = applyCalendarReschedule(tasks, move);

    expect(moved[0]?.due_date).toBe("2026-05-10");
    expect(revertCalendarReschedule(moved, move)[0]?.due_date).toBe("2026-05-03");
  });

  test("sprint range band covers correct cells for a fixture sprint", () => {
    const month = buildCalendarMonth("2026-05-15");

    expect(buildSprintBandCells(month.cells, { start_date: "2026-05-04", end_date: "2026-05-18" })).toEqual([
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
    ]);
  });
});
