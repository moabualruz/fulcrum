import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { TaskDetailScreen } from "./task-detail.ts";

describe("TaskDetailScreen quit confirmation", () => {
  test("confirms before discarding task detail draft overlay", async () => {
    const screen = new TaskDetailScreen({
      taskId: "task-1",
      caller: {
        tasks: {
          get: async () => ({
            id: "task-1",
            title: "Fix flaky graph",
          }),
          update: async () => ({ title: "Updated" }),
        },
      },
    });

    await screen.load();
    await screen.handleKey("e");
    expect(screen.hasUnsavedDraft).toBe(true);

    expect(await screen.handleKey("q")).toBe(true);
    expect(screen.quitConfirmationMessage).toBe("Unsaved edits. Quit? (y/n)");

    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);
    screen.render(renderer);
    expect(tty.plainText()).toContain("Unsaved edits. Quit? (y/n)");
    expect(tty.plainText()).toContain("Discard task detail draft changes.");

    await screen.handleKey("\x1b");
    expect(screen.hasUnsavedDraft).toBe(true);
    expect(screen.quitConfirmationMessage).toBeNull();

    await screen.handleKey("q");
    await screen.handleKey("y");
    expect(screen.hasUnsavedDraft).toBe(false);
  });

  test("lets clean task detail q bubble to shell", async () => {
    const screen = new TaskDetailScreen({
      taskId: "task-1",
      caller: {
        tasks: {
          get: async () => ({ id: "task-1", title: "Clean task" }),
        },
      },
    });

    await screen.load();
    expect(await screen.handleKey("q")).toBe(false);
    expect(screen.quitConfirmationMessage).toBeNull();
  });
});
