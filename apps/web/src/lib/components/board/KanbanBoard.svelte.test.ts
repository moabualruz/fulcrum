import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";

type KanbanBoardProps = {
  projectId: string;
  tasks: BoardTask[];
};

const task = (id: string, status: string, extra: Partial<BoardTask> = {}): BoardTask => ({
  id,
  title: extra.title ?? `Task ${id}`,
  status,
  priority: 3,
  project_id: "project-1",
  updated_at: "",
  labels: ["frontend"],
  points: 5,
  assignee: "Maya",
  ...extra,
});

describe("KanbanBoard component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let KanbanBoard: Component<KanbanBoardProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./KanbanBoard.svelte")) as {
      default: Component<KanbanBoardProps>;
    };
    KanbanBoard = mod.default;
  });

  test("renders status columns and card mini-detail", () => {
    const { body } = render(KanbanBoard, {
      props: {
        projectId: "project-1",
        tasks: [
          task("1", "pending", { title: "A very long task title that should be clamped to two lines", blocked: true }),
          task("2", "completed", { priority: 5, labels: ["backend", "api"], points: 8 }),
        ],
      },
    });

    expect(body).toMatch(/data-kanban-board/);
    expect(body).toMatch(/data-status="pending"/);
    expect(body).toMatch(/data-status="completed"/);
    expect(body).toMatch(/data-board-card-title[^>]*>A very long task title/);
    expect(body).toMatch(/data-board-card-priority[^>]*>P3</);
    expect(body).toMatch(/data-board-card-priority[^>]*>P5</);
    expect(body).toMatch(/data-board-card-assignee[^>]*>Maya</);
    expect(body).toMatch(/data-board-card-due-date/);
    expect(body).toMatch(/data-board-card-estimate/);
  });

  test("renders sprint filter and swimlane controls", () => {
    const { body } = render(KanbanBoard, {
      props: {
        projectId: "project-1",
        tasks: [task("1", "pending", { sprint_id: "sprint-1", sprint_name: "Sprint 1" })],
      },
    });

    expect(body).toMatch(/data-sprint-filter/);
    expect(body).toMatch(/>All</);
    expect(body).toMatch(/>Backlog</);
    expect(body).toMatch(/>Sprint 1</);
    expect(body).toMatch(/data-swimlane-toggle/);
  });
});
