import { describe, expect, test } from "vitest";
import {
  applyTimelineMove,
  buildTimelineModel,
  loadTimelineZoom,
  rememberTimelineZoom,
  resizeTimelineEnd,
  type TimelineTask,
} from "../../src/lib/components/tasks/task-timeline";

function task(id: string, extra: Partial<TimelineTask> = {}): TimelineTask {
  return {
    id,
    title: `Task ${id}`,
    status: "pending",
    priority: 1,
    project_id: "project-1",
    updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

describe("task timeline model", () => {
  test("positions bars by start_date and due_date, falling back to created_at", () => {
    const model = buildTimelineModel(
      [
        task("a", { start_date: "2026-01-05", due_date: "2026-01-10" }),
        task("b", { created_at: "2026-01-03T12:00:00Z", due_date: "2026-01-04" }),
      ],
      { anchor: "2026-01-01", zoom: "day" },
    );

    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]).toMatchObject({ id: "a", start: "2026-01-05", end: "2026-01-10" });
    expect(model.rows[0]?.offsetDays).toBe(4);
    expect(model.rows[0]?.durationDays).toBe(6);
    expect(model.rows[1]).toMatchObject({ id: "b", start: "2026-01-03", end: "2026-01-04" });
  });

  test("creates dependency arrow paths for blocks relationships", () => {
    const model = buildTimelineModel(
      [
        task("blocker", { start_date: "2026-01-01", due_date: "2026-01-04", blocks: ["blocked"] }),
        task("blocked", { start_date: "2026-01-08", due_date: "2026-01-10" }),
      ],
      { anchor: "2026-01-01", zoom: "day" },
    );

    expect(model.dependencies).toHaveLength(1);
    expect(model.dependencies[0]).toMatchObject({ from: "blocker", to: "blocked" });
    expect(model.dependencies[0]?.path).toMatch(/^M /);
  });

  test("moves a task bar left or right while preserving duration", () => {
    const moved = applyTimelineMove(task("a", { start_date: "2026-01-05", due_date: "2026-01-10" }), 3);

    expect(moved).toEqual({ start_date: "2026-01-08", due_date: "2026-01-13" });
  });

  test("resizes right edge by updating only due_date", () => {
    const resized = resizeTimelineEnd(task("a", { start_date: "2026-01-05", due_date: "2026-01-10" }), 2);

    expect(resized).toEqual({ due_date: "2026-01-12" });
  });

  test("persists and restores active zoom", () => {
    const storage = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    rememberTimelineZoom("quarter", localStorage);

    expect(loadTimelineZoom(localStorage)).toBe("quarter");
    expect(loadTimelineZoom({ getItem: () => "invalid" })).toBe("month");
  });

  test("builds a 6-month model for 100 tasks under 500ms", () => {
    const tasks = Array.from({ length: 100 }, (_, index) =>
      task(`task-${index}`, {
        start_date: `2026-${String((index % 6) + 1).padStart(2, "0")}-01`,
        due_date: `2026-${String((index % 6) + 1).padStart(2, "0")}-10`,
      }),
    );
    const started = performance.now();

    const model = buildTimelineModel(tasks, { anchor: "2026-01-01", zoom: "week" });

    expect(performance.now() - started).toBeLessThan(500);
    expect(model.rows).toHaveLength(100);
  });
});
