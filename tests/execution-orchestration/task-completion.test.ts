import { describe, expect, test } from "bun:test";

import {
  getTaskCompletionBlockerForWorkItem,
  getTaskCompletionBlocker,
  getTaskCompletionBlockerForStore,
  type CompletableTask,
} from "@execution-orchestration/domain/task-completion.ts";

function task(overrides: Partial<CompletableTask> = {}): CompletableTask {
  return {
    blockedBy: undefined,
    dependencies: [],
    ...overrides,
  };
}

describe("dependency orchestration task completion blocker", () => {
  test("allows completion when there are no blockers or dependencies", async () => {
    await expect(getTaskCompletionBlocker(task())).resolves.toBeUndefined();
  });

  test("blocks completion when blockedBy is present and trims whitespace", async () => {
    await expect(getTaskCompletionBlocker(task({ blockedBy: "  FN-123  " })))
      .resolves.toBe("task is blocked by FN-123");
  });

  test("keeps conservative behavior when dependencies cannot be resolved", async () => {
    await expect(getTaskCompletionBlocker(task({ dependencies: ["FN-001"] }))).resolves.toBeUndefined();
  });

  test("allows dependencies in done, in-review, or archived columns", async () => {
    const resolved = new Map([
      ["FN-DONE", { id: "FN-DONE", column: "done" as const }],
      ["FN-REVIEW", { id: "FN-REVIEW", column: "in-review" as const }],
      ["FN-ARCHIVED", { id: "FN-ARCHIVED", column: "archived" as const }],
    ]);

    await expect(getTaskCompletionBlocker(
      task({ dependencies: ["FN-DONE", "FN-REVIEW", "FN-ARCHIVED"] }),
      { resolveTask: async (id) => resolved.get(id) },
    )).resolves.toBeUndefined();
  });

  test("blocks unresolved, missing, and not-done dependencies in original order", async () => {
    const resolved = new Map([
      ["FN-DONE", { id: "FN-DONE", column: "done" as const }],
      ["FN-TODO", { id: "FN-TODO", column: "todo" as const }],
      ["FN-PROGRESS", { id: "FN-PROGRESS", column: "in-progress" as const }],
    ]);

    await expect(getTaskCompletionBlocker(
      task({ dependencies: ["FN-DONE", "FN-TODO", "FN-MISSING", "FN-PROGRESS"] }),
      { resolveTask: async (id) => resolved.get(id) ?? null },
    )).resolves.toBe("task has unresolved dependencies: FN-TODO, FN-MISSING, FN-PROGRESS");
  });

  test("store wrapper treats dependency lookup failures as unresolved dependencies", async () => {
    const calls: string[] = [];
    const store = {
      async getTask(taskId: string) {
        calls.push(taskId);
        if (taskId === "FN-DONE") return { id: taskId, column: "done" as const };
        throw new Error("database temporarily unavailable");
      },
    };

    await expect(getTaskCompletionBlockerForStore(
      store,
      task({ dependencies: ["FN-DONE", "FN-MISSING"] }),
    )).resolves.toBe("task has unresolved dependencies: FN-MISSING");

    expect(calls).toEqual(["FN-DONE", "FN-MISSING"]);
  });

  test("Fulcrum adapter maps blocked_by dependencies into dependency completion semantics", async () => {
    const resolved = new Map([
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", column: "done" as const }],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", column: "todo" as const }],
    ]);

    await expect(getTaskCompletionBlockerForWorkItem(
      {
        dependencies: {
          blocks: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
          blocked_by: [
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          ],
        },
      },
      { resolveTask: async (id) => resolved.get(id) },
    )).resolves.toBe("task has unresolved dependencies: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});
