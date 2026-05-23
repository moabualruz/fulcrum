import { describe, expect, test } from "bun:test";
import { run as runSearch } from "./search.ts";
import { run as runSprints } from "../sprints.ts";
import { run as runTasks } from "./tasks.ts";

type ExitFn = (code: number) => void;

function testIo() {
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
      exit: ((code: number) => exits.push(code)) as ExitFn,
    },
  };
}

async function runFulcrum(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([
    process.execPath,
    "run",
    "apps/cli/src/main.ts",
    ...args,
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      FULCRUM_HOME: `${process.env["TMPDIR"] ?? "/tmp"}/fulcrum-project-work-suite`,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("project work command suite", () => {
  test("exercises task state changes and sprint moves through shared callers", async () => {
    const taskCalls: unknown[] = [];
    const sprintCalls: unknown[] = [];
    const taskIo = testIo();
    const sprintIo = testIo();
    const taskCaller = {
      tasks: {
        list: async (input?: unknown) => {
          taskCalls.push(["list", input]);
          return [{ id: "task-1", status: "todo" }];
        },
        get: async (input: unknown) => {
          taskCalls.push(["get", input]);
          return { id: "task-1", status: "todo" };
        },
        create: async (input: unknown) => {
          taskCalls.push(["create", input]);
          return { id: "task-1", status: "todo" };
        },
        update: async (input: unknown) => {
          taskCalls.push(["update", input]);
          return { id: "task-1", status: "in_progress" };
        },
        delete: async (input: unknown) => {
          taskCalls.push(["delete", input]);
          return { ok: true };
        },
      },
    };
    const sprintCaller = {
      sprints: {
        addTask: async (input: unknown) => {
          sprintCalls.push(["addTask", input]);
          return { ok: true, sprintId: "sprint-1", taskId: "task-1" };
        },
        removeTask: async (input: unknown) => {
          sprintCalls.push(["removeTask", input]);
          return { ok: true, sprintId: "sprint-1", taskId: "task-1" };
        },
      },
    };

    await runTasks(["create", "--title", "Ship filters", "--status", "todo", "--points", "3", "--json"], {
      caller: taskCaller,
      ...taskIo.opts,
    });
    await runTasks(["update", "task-1", "--status", "in_progress", "--points", "5", "--json"], {
      caller: taskCaller,
      ...taskIo.opts,
    });
    await runTasks(["list", "--include-deleted", "--json"], {
      caller: taskCaller,
      ...taskIo.opts,
    });
    await runSprints(["add-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], {
      caller: sprintCaller,
      ...sprintIo.opts,
    });
    await runSprints(["remove-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], {
      caller: sprintCaller,
      ...sprintIo.opts,
    });

    expect(taskIo.err).toEqual([]);
    expect(sprintIo.err).toEqual([]);
    expect(taskCalls).toEqual([
      ["create", { title: "Ship filters", status: "todo", points: 3 }],
      ["update", { id: "task-1", status: "in_progress", points: 5 }],
      ["list", { includeDeleted: true }],
    ]);
    expect(sprintCalls).toEqual([
      ["addTask", { sprintId: "sprint-1", taskId: "task-1" }],
      ["removeTask", { sprintId: "sprint-1", taskId: "task-1" }],
    ]);
    // `fulcrum task` verbs wrap `--json` output in the canonical fulcrum.cli.v1
    // envelope (CLI-TUI-UX §3); the payload is `.result` (prd-cli-build-stage-parity).
    expect(taskIo.out.map((line) => {
      const envelope = JSON.parse(line) as { schema: string; result: unknown };
      expect(envelope.schema).toBe("fulcrum.cli.v1");
      return envelope.result;
    })).toEqual([
      { id: "task-1", status: "todo" },
      { id: "task-1", status: "in_progress" },
      [{ id: "task-1", status: "todo" }],
    ]);
  });

  test("exercises saved-view filters with project scoping", async () => {
    const calls: unknown[] = [];
    const io = testIo();
    const caller = {
      search: {
        query: async () => ({}),
        suggest: async () => ({}),
        savedList: async (input?: unknown) => {
          calls.push(["savedList", input]);
          return [{ id: "view-1", project: "project-1" }];
        },
        savedCreate: async (input: unknown) => {
          calls.push(["savedCreate", input]);
          return { id: "view-1" };
        },
        savedDelete: async (input: unknown) => {
          calls.push(["savedDelete", input]);
          return { ok: true };
        },
      },
    };

    await runSearch(["saved", "create", "--name", "My blockers", "--query-json", "{\"filters\":[{\"field\":\"status\",\"op\":\"in\",\"value\":[\"blocked\"]}]}", "--json"], {
      caller,
      ...io.opts,
    });
    await runSearch(["saved", "list", "--project", "project-1", "--json"], {
      caller,
      ...io.opts,
    });
    await runSearch(["saved", "delete", "view-1", "--json"], {
      caller,
      ...io.opts,
    });

    expect(io.err).toEqual([]);
    expect(calls).toEqual([
      ["savedCreate", { name: "My blockers", queryJson: { filters: [{ field: "status", op: "in", value: ["blocked"] }] } }],
      ["savedList", { project: "project-1" }],
      ["savedDelete", { id: "view-1" }],
    ]);
  });

  test("routes generated PM domains from top-level CLI for manual simulation", async () => {
    const cases = [
      ["relationships", "create", "--source-task-id", "task-1", "--target-task-id", "task-2", "--type", "blocks", "--json"],
      ["comments", "create", "--task-id", "task-1", "--parent-comment-id", "comment-1", "--json"],
      ["templates", "apply-template", "--template-id", "template-1", "--json"],
      ["automations", "create", "--project-id", "project-1", "--name", "Auto assign", "--trigger-type", "status_changed", "--condition-field", "status", "--condition-operator", "equals", "--action-type", "assign", "--json"],
      ["recurrence", "create", "--task-id", "task-1", "--trigger-type", "schedule", "--interval-days", "7", "--timezone", "UTC", "--json"],
      ["saved_views", "create", "--json"],
      ["taskCustomFields", "set", "--json"],
      ["customFieldDefs", "list", "--json"],
    ];

    for (const args of cases) {
      const result = await runFulcrum(args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        error: {
          code: "INTERNAL_ERROR",
        },
      });
    }
  }, 20_000);
});
