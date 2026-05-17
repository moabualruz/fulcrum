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

  test("add-task + remove-task route through the configured public API", async () => {
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const logs: string[] = [];
    await run(["add-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return Response.json({ id: "assignment-1", taskId: "task-1" });
      }) as typeof fetch,
      print: (line) => logs.push(line),
      printErr: () => {},
      exit: () => {},
    });
    await run(["remove-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(null, { status: 204 });
      }) as typeof fetch,
      print: (line) => logs.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "http://127.0.0.1:3210/api/v1/sprints/sprint-1/tasks"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/sprints/sprint-1/tasks/task-1?orgId=org-1"],
    ]);
    expect(calls[0]?.body).toMatchObject({ orgId: "org-1", taskId: "task-1" });
    expect(JSON.parse(logs[0]!)).toEqual({ id: "assignment-1", taskId: "task-1" });
    expect(JSON.parse(logs[1]!)).toEqual(null);
  });

  test("requires the configured sprint public API when no caller is injected", async () => {
    const errors: string[] = [];
    const exits: number[] = [];
    await run(["add-task", "--sprint-id", "sprint-1", "--task-id", "task-1"], {
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
      print: () => {},
      printErr: (line) => errors.push(line),
      exit: (code) => exits.push(code),
    });

    expect(exits).toEqual([1]);
    expect(errors.join("\n")).toContain("Sprint API caller is not configured");
  });
});
