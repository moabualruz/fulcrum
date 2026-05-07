import { describe, expect, test } from "bun:test";

import { run as runTasks } from "../commands/tasks.ts";
import { run as runSprints } from "../sprints.ts";

describe("CLI E2E CRUD workflows with application callers", () => {
  test("task create update delete flow preserves stdout contracts", async () => {
    const calls: string[] = [];
    const io = captureIo();
    const caller = {
      tasks: {
        create: async (input: Record<string, unknown>) => {
          calls.push(`create:${input["title"]}`);
          return { id: "task-1", ...input };
        },
        update: async (input: Record<string, unknown>) => {
          calls.push(`update:${input["id"]}:${input["status"]}`);
          return { id: input["id"], status: input["status"] };
        },
        delete: async (input: { id: string }) => {
          calls.push(`delete:${input.id}`);
          return { id: input.id, deleted: true };
        },
      },
    };

    await runTasks(["create", "--title", "Ship E2E", "--status", "todo", "--json"], { ...io.opts, caller } as never);
    await runTasks(["update", "task-1", "--status", "done", "--json"], { ...io.opts, caller } as never);
    await runTasks(["delete", "task-1", "--json"], { ...io.opts, caller } as never);

    expect(calls).toEqual(["create:Ship E2E", "update:task-1:done", "delete:task-1"]);
    expect(io.out.map((line) => JSON.parse(line))).toEqual([
      { id: "task-1", title: "Ship E2E", status: "todo" },
      { id: "task-1", status: "done" },
      { id: "task-1", deleted: true },
    ]);
    expect(io.exits).toEqual([]);
  });

  test("sprint add and remove task flow calls application sprint adapter", async () => {
    const calls: string[] = [];
    const io = captureIo();
    const caller = {
      sprints: {
        addTask: async (input: { sprintId: string; taskId: string }) => {
          calls.push(`add:${input.sprintId}:${input.taskId}`);
          return { ok: true };
        },
        removeTask: async (input: { sprintId: string; taskId: string }) => {
          calls.push(`remove:${input.sprintId}:${input.taskId}`);
          return { ok: true };
        },
      },
    };

    await runSprints(["add-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], { ...io.opts, caller } as never);
    await runSprints(["remove-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], { ...io.opts, caller } as never);

    expect(calls).toEqual(["add:sprint-1:task-1", "remove:sprint-1:task-1"]);
    expect(io.out.map((line) => JSON.parse(line))).toEqual([{ ok: true }, { ok: true }]);
    expect(io.exits).toEqual([]);
  });
});

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}
