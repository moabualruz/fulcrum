import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";

type BoardCardProps = {
  task: BoardTask;
  onEdit?: (taskId: string) => void;
  draggable?: boolean;
};

describe("BoardCard component", () => {
  let render: typeof import("svelte/server").render;
  let BoardCard: Component<BoardCardProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./BoardCard.svelte")) as {
      default: Component<BoardCardProps>;
    };
    BoardCard = mod.default;
  });

  const baseTask: BoardTask = {
    id: "01J",
    title: "Wire UI",
    status: "in_progress",
    priority: 5,
    project_id: null,
    updated_at: "",
  };

  test("renders a button with data hooks + aria-label derived from task", () => {
    const { body } = render(BoardCard, { props: { task: baseTask } });
    expect(body).toMatch(
      /<button\b[^>]*data-board-card\b[^>]*data-task-id="01J"[^>]*data-status="in_progress"[^>]*data-priority="5"[^>]*aria-label="Edit task: Wire UI"/,
    );
  });

  test("renders the task title inside data-board-card-title", () => {
    const { body } = render(BoardCard, { props: { task: baseTask } });
    expect(body).toMatch(/data-board-card-title[^>]*>Wire UI</);
  });

  test("renders priority marker as P<priority>", () => {
    const { body } = render(BoardCard, { props: { task: baseTask } });
    expect(body).toMatch(/data-board-card-priority[^>]*>P5</);
  });

  test("renders project marker only when project_id is set", () => {
    const withProject: BoardTask = { ...baseTask, project_id: "alpha" };
    const withProjectBody = render(BoardCard, { props: { task: withProject } }).body;
    expect(withProjectBody).toMatch(/data-board-card-project/);

    const withoutProjectBody = render(BoardCard, { props: { task: baseTask } }).body;
    expect(withoutProjectBody).not.toMatch(/data-board-card-project/);
  });
});
