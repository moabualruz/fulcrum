import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { BoardTask } from "$lib/product-queries";
import type { TaskStatus } from "$lib/server/tasks";

type BoardSheetProps = {
  open: boolean;
  task: BoardTask | null;
  onSave?: (input: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: number;
    description: string | null;
  }) => void;
  onDelete?: (id: string) => void;
  onClose?: () => void;
};

const sampleTask: BoardTask = {
  id: "01J",
  title: "Wire UI",
  status: "in_progress",
  priority: 5,
  project_id: null,
  updated_at: "",
};

describe("BoardSheet (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let BoardSheet: Component<BoardSheetProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./BoardSheet.svelte")) as {
      default: Component<BoardSheetProps>;
    };
    BoardSheet = mod.default;
  });

  test("renders a closed shell with no form when task is null", () => {
    const { body } = render(BoardSheet, { props: { open: false, task: null } });
    expect(body).not.toMatch(/data-slot="sheet-content"/);
    expect(body).not.toMatch(/data-board-sheet-form/);
  });

  test("renders the editor form when open and task is provided", () => {
    const { body } = render(BoardSheet, { props: { open: true, task: sampleTask } });
    expect(body).toMatch(/data-board-sheet\b[^>]*data-state="open"/);
    expect(body).toMatch(/data-board-sheet\b[^>]*aria-hidden="false"/);
    expect(body).toContain('data-slot="sheet-content"');
    expect(body).toContain('data-slot="sheet-overlay"');
    expect(body).not.toMatch(/<aside\b/);
    expect(body).toMatch(/data-board-sheet-form/);
    expect(body).toMatch(/data-board-sheet-title/);
    expect(body).toMatch(/data-board-sheet-status/);
    expect(body).toMatch(/data-board-sheet-priority/);
    expect(body).toMatch(/data-board-sheet-description/);
    expect(body).toMatch(/data-board-sheet-save/);
    expect(body).toMatch(/data-board-sheet-delete/);
  });

  test("title input value reflects the task title", () => {
    const { body } = render(BoardSheet, { props: { open: true, task: sampleTask } });
    expect(body).toMatch(/data-board-sheet-title[^>]*value="Wire UI"|value="Wire UI"[^>]*data-board-sheet-title/);
  });

  test("status select renders the ui-kit trigger with the task's current status", () => {
    const { body } = render(BoardSheet, { props: { open: true, task: sampleTask } });
    expect(body).toMatch(/data-board-sheet-status/);
    expect(body).toMatch(/data-slot="select-trigger"/);
    expect(body).toContain("in_progress");
  });

  test("close button has aria-label and data-board-sheet-close", () => {
    const { body } = render(BoardSheet, { props: { open: true, task: sampleTask } });
    expect(body).toMatch(/data-board-sheet-close\b[^>]*aria-label="close"|aria-label="close"[^>]*data-board-sheet-close/);
  });
});
