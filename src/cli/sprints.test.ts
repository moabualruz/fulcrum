import { describe, expect, test } from "bun:test";

import { run } from "./sprints.ts";

describe("CLI: fulcrum sprints", () => {
  test("add-task + remove-task round-trip through caller", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const logs: string[] = [];
    const caller = {
      sprints: {
        addTask: async (input: { sprintId: string; taskId: string }) => {
          calls.push({ method: "addTask", input });
          return { ok: true, ...input };
        },
        removeTask: async (input: { sprintId: string; taskId: string }) => {
          calls.push({ method: "removeTask", input });
          return { ok: true, ...input };
        },
      },
    };

    await run(["add-task", "--sprint-id", "s1", "--task-id", "t1", "--json"], {
      caller,
      print: (line) => logs.push(line),
      printErr: () => {},
      exit: () => {},
    });
    await run(["remove-task", "--sprint-id", "s1", "--task-id", "t1", "--json"], {
      caller,
      print: (line) => logs.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(calls).toEqual([
      { method: "addTask", input: { sprintId: "s1", taskId: "t1" } },
      { method: "removeTask", input: { sprintId: "s1", taskId: "t1" } },
    ]);
    expect(JSON.parse(logs[0]!)).toEqual({ ok: true, sprintId: "s1", taskId: "t1" });
    expect(JSON.parse(logs[1]!)).toEqual({ ok: true, sprintId: "s1", taskId: "t1" });
  });
});
