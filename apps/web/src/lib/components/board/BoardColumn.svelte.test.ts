import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";
import type { TaskStatus } from "$lib/server/tasks";
import type { DndMovePayload } from "./board-column-handlers.ts";

type BoardColumnProps = {
  status: TaskStatus;
  label: string;
  tasks: BoardTask[];
  allTasks: BoardTask[];
  onCardEdit?: (taskId: string) => void;
  onMove?: (move: DndMovePayload) => void;
  onCreate?: (title: string) => void;
};

const task = (id: string, title: string, status: TaskStatus = "pending"): BoardTask => ({
  id,
  title,
  status,
  priority: 1,
  project_id: null,
  updated_at: "",
});

describe("BoardColumn component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let BoardColumn: Component<BoardColumnProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./BoardColumn.svelte")) as {
      default: Component<BoardColumnProps>;
    };
    BoardColumn = mod.default;
  });

  test("renders header with label and count, and one <li> per task", () => {
    const tasks = [task("a", "alpha"), task("b", "beta"), task("c", "gamma")];
    const { body } = render(BoardColumn, {
      props: {
        status: "pending",
        label: "Pending",
        tasks,
        allTasks: tasks,
      },
    });
    expect(body).toMatch(/data-board-column[^>]*data-status="pending"/);
    expect(body).toMatch(/data-board-column-header/);
    expect(body).toMatch(/>Pending</);
    expect(body).toMatch(/data-board-column-count[^>]*>3</);
    const cardMatches = body.match(/data-board-card(?=[\s>=])/g) ?? [];
    expect(cardMatches.length).toBe(3);
    const liMatches = body.match(/<li\b/g) ?? [];
    expect(liMatches.length).toBe(3);
  });

  test("renders count 0 and an empty list when no tasks supplied", () => {
    const { body } = render(BoardColumn, {
      props: {
        status: "blocked",
        label: "Blocked",
        tasks: [],
        allTasks: [],
      },
    });
    expect(body).toMatch(/data-board-column-count[^>]*>0</);
    expect(body).toMatch(/data-board-column-list/);
    expect(body).not.toMatch(/data-board-card(?=[\s>=])/);
  });

  test("renders inline-add form with input hooks", () => {
    const { body } = render(BoardColumn, {
      props: {
        status: "pending",
        label: "Pending",
        tasks: [],
        allTasks: [],
      },
    });
    expect(body).toMatch(/data-board-column-add/);
    expect(body).toMatch(/data-board-column-input/);
  });
});
