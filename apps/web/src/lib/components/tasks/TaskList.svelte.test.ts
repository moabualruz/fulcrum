import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { TaskViewRow } from "./task-view-types.ts";

type TaskListProps = {
  tasks: TaskViewRow[];
  projectId: string;
};

function task(index: number): TaskViewRow {
  return {
    id: `task-${index}`,
    title: `Task ${index}`,
    status: index % 2 === 0 ? "pending" : "in_progress",
    priority: index % 5,
    project_id: "project-1",
    created_at: `2026-04-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
    updated_at: "2026-04-30T10:00:00.000Z",
    assignee: index % 3 === 0 ? "Maya" : null,
    labels: ["web"],
  };
}

describe("TaskList component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let TaskList: Component<TaskListProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./TaskList.svelte")) as {
      default: Component<TaskListProps>;
    };
    TaskList = mod.default;
  });

  test("renders all task data in list rows", () => {
    const { body } = render(TaskList, {
      props: { projectId: "project-1", tasks: [task(1), task(2)] },
    });

    expect(body).toContain('data-task-list');
    expect(body).toContain('data-virtual-item-height="48"');
    expect(body).toContain('data-virtual-overscan="5"');
    expect(body).toContain('data-task-list-row');
    expect(body).toContain("Task 1");
    expect(body).toContain("in_progress");
  });

  test("renders 1000 task items without blank rows", () => {
    const tasks = Array.from({ length: 1000 }, (_, index) => task(index));
    const { body } = render(TaskList, {
      props: { projectId: "project-1", tasks },
    });

    const rows = body.match(/data-task-list-row/g) ?? [];
    const blanks = body.match(/data-task-list-blank/g) ?? [];
    expect(rows).toHaveLength(1000);
    expect(blanks).toHaveLength(0);
  });

  test("list row links to task detail modal route", () => {
    const { body } = render(TaskList, {
      props: { projectId: "project-1", tasks: [task(7)] },
    });

    expect(body).toMatch(/data-task-list-link[^>]*href="\/projects\/project-1\/board\?task=task-7/);
  });
});
