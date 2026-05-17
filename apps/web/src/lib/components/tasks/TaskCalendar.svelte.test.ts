import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";

type Props = {
  projectId: string;
  tasks: BoardTask[];
  initialMonth: string;
  activeSprint: { start_date: string; end_date: string; name: string } | null;
};

const task = (id: string, due_date: string | null, title = `Task ${id}`): BoardTask => ({
  id,
  title,
  status: "pending",
  priority: 1,
  project_id: "project-1",
  updated_at: "2026-05-01T00:00:00.000Z",
  due_date,
});

describe("TaskCalendar component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let TaskCalendar: Component<Props>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./TaskCalendar.svelte")) as { default: Component<Props> };
    TaskCalendar = mod.default;
  });

  test("renders monthly grid, due tasks, unscheduled sidebar, and sprint band", () => {
    const { body } = render(TaskCalendar, {
      props: {
        projectId: "project-1",
        initialMonth: "2026-05-15",
        activeSprint: { name: "Sprint 7", start_date: "2026-05-04", end_date: "2026-05-18" },
        tasks: [
          task("a", "2026-05-03", "Write spec"),
          task("b", "2026-05-03", "Review copy"),
          task("c", "2026-05-03", "Third task"),
          task("d", "2026-05-03", "Hidden overflow"),
          task("e", "2026-05-17", "Ship calendar"),
          task("f", null, "Backlog task"),
        ],
      },
    });

    expect(body).toMatch(/data-task-calendar/);
    expect(body).toMatch(/aria-label="tasks for 2026-05-03"/);
    expect(body).toMatch(/data-calendar-task[^>]*href="\/projects\/project-1\/board\?task=a"/);
    expect(body).toContain("Write spec");
    expect(body).toContain("Ship calendar");
    expect(body).toContain("+1 more");
    expect(body).toMatch(/data-unscheduled-sidebar/);
    expect(body).toContain("Backlog task");
    expect(body).toMatch(/data-sprint-band-cell[^>]*data-date="2026-05-04"/);
    expect(body).toMatch(/data-sprint-band-cell[^>]*data-date="2026-05-18"/);
    expect(body).toMatch(/aria-dropeffect="move"/);
  });
});
