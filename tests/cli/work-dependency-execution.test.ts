import { describe, expect, test } from "bun:test";

import { run } from "@fulcrum/cli/commands/work.ts";

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
      exit: (code: number) => exits.push(code),
    },
  };
}

describe("work dependency execution CLI", () => {
  test("routes dependency graph, dispatch, and feedback through dependency-run caller", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const caller = {
      tasks: {
        previewDependencyRun: async (input: Record<string, unknown>) => {
          calls.push({ method: "previewDependencyRun", input });
          return {
            traceId: input["traceId"],
            orderedTaskIds: input["targetTaskIds"],
            blockers: [],
            runs: [{ taskId: "task-1", state: "ready" }],
          };
        },
        dispatchDependencyRun: async (input: Record<string, unknown>) => {
          calls.push({ method: "dispatchDependencyRun", input });
          return {
            traceId: input["traceId"],
            runGroupId: input["traceId"],
            scheduledRuns: [{ id: "run-1", taskId: "task-1", status: "queued" }],
            skippedTasks: [],
          };
        },
        dependencyRunLiveFeedback: async (input: Record<string, unknown>) => {
          calls.push({ method: "dependencyRunLiveFeedback", input });
          return {
            traceId: input["traceId"],
            executorStatus: { active: false, queuedTaskCount: 0, blockedTaskCount: 0 },
            retryAvailable: true,
            cancelAvailable: false,
            events: [{ summary: "Dependency run queued" }],
          };
        },
      },
    };

    for (const argv of [
      ["dependency-graph", "--task", "task-1", "--project", "project-1", "--trace", "trace-work", "--json"],
      ["dependency-run", "dispatch", "--tasks", "task-1,task-2", "--project", "project-1", "--trace", "trace-work", "--agent", "codex", "--model", "gpt-work", "--prompt", "Run ordered tasks", "--json"],
      ["dependency-run", "feedback", "--project", "project-1", "--trace", "trace-work", "--run-group", "trace-work", "--json"],
    ]) {
      const io = testIo();
      await run(argv, { ...io.opts, caller });
      expect(io.err).toEqual([]);
      expect(io.exits).toEqual([]);
      expect(JSON.parse(io.out[0] as string)).toMatchObject({ traceId: "trace-work" });
    }

    expect(calls).toEqual([
      {
        method: "previewDependencyRun",
        input: {
          mode: "task",
          targetTaskIds: ["task-1"],
          projectId: "project-1",
          traceId: "trace-work",
        },
      },
      {
        method: "dispatchDependencyRun",
        input: {
          mode: "board",
          targetTaskIds: ["task-1", "task-2"],
          projectId: "project-1",
          traceId: "trace-work",
          agent: "codex",
          model: "gpt-work",
          prompt: "Run ordered tasks",
        },
      },
      {
        method: "dependencyRunLiveFeedback",
        input: {
          projectId: "project-1",
          traceId: "trace-work",
          runGroupId: "trace-work",
        },
      },
    ]);
  });

  test("uses configured workflow public API for dependency-run verbs", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const io = testIo();
    const fetchStub: typeof globalThis.fetch = Object.assign(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
        if (String(url).endsWith("/preview")) return Response.json({ traceId: "trace-api", orderedTaskIds: ["task-1"] });
        if (String(url).endsWith("/dispatch")) return Response.json({ traceId: "trace-api", runGroupId: "trace-api" });
        return Response.json({ traceId: "trace-api", executorStatus: { active: false } });
      },
      { preconnect: () => {} },
    );

    const opts = {
      ...io.opts,
      env: { FULCRUM_SERVER_URL: "http://127.0.0.1:4321" },
      fetch: fetchStub,
    };

    await run(["dependency-graph", "--task", "task-1", "--trace", "trace-api", "--json"], opts);
    await run(["dependency-run", "dispatch", "--task", "task-1", "--trace", "trace-api", "--agent", "codex", "--json"], opts);
    await run(["dependency-run", "feedback", "--trace", "trace-api", "--json"], opts);

    expect(io.err).toEqual([]);
    expect(io.exits).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:4321/workflows/execution/dependency-run/preview",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/dispatch",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/live-feedback",
    ]);
    expect(calls.map((call) => call.body)).toEqual([
      { mode: "task", targetTaskIds: ["task-1"], traceId: "trace-api" },
      { mode: "task", targetTaskIds: ["task-1"], traceId: "trace-api", agent: "codex" },
      { traceId: "trace-api" },
    ]);
  });

  test("rejects dependency-run dispatch without an agent", async () => {
    const io = testIo();

    await run(["dependency-run", "dispatch", "--task", "task-1", "--json"], {
      ...io.opts,
      caller: { tasks: { dispatchDependencyRun: async () => ({}) } },
    });

    expect(io.out).toEqual([]);
    expect(io.exits).toEqual([1]);
    expect(io.err.join("\n")).toContain("missing required flag --agent");
  });
});
