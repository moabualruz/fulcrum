import { describe, expect, test } from "bun:test";

import { runPillar14Command } from "../../apps/cli/src/commands/pillar14-generated.ts";

function harness(caller: unknown) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    opts: {
      caller,
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => {
        throw new Error(`exit ${code}`);
      },
    },
  };
}

describe("workflow-completeness agent workflow CLI", () => {
  test("runs dispatch --task emits the shared dispatch trace as JSON", async () => {
    const calls: unknown[] = [];
    const h = harness({
      orchestration: {
        dispatchRun: async (input: unknown) => {
          calls.push(input);
          return {
            runId: "run-1",
            state: "queued",
            agent: "codex",
            trace: {
              task: { id: "task-1" },
              context: { sourceRefs: [{ kind: "task", id: "task-1" }] },
              authority: { trustMode: "assisted", approvalRequired: false },
            },
          };
        },
      },
    });

    await runPillar14Command("runs", ["dispatch", "--task", "task-1", "--agent", "codex", "--json-raw"], h.opts);

    expect(calls).toEqual([{ taskId: "task-1", agentName: "codex" }]);
    expect(JSON.parse(h.out[0] ?? "{}")).toMatchObject({
      runId: "run-1",
      trace: { task: { id: "task-1" }, authority: { trustMode: "assisted" } },
    });
  });

  test("runs watch --json emits one observability snapshot for completed runs", async () => {
    const h = harness({
      orchestration: {
        getRun: async () => ({
          id: "run-1",
          state: "succeeded",
          observability: {
            context: { sourceRefs: [{ kind: "task", id: "task-1" }] },
            artifacts: [{ filename: "summary.md" }],
            audit: [{ verb: "dispatched" }],
            recovery: { retryable: false },
          },
        }),
      },
    });

    await runPillar14Command("runs", ["watch", "run-1", "--json-raw"], h.opts);

    expect(JSON.parse(h.out[0] ?? "{}")).toMatchObject({
      id: "run-1",
      state: "succeeded",
      observability: {
        artifacts: [{ filename: "summary.md" }],
        recovery: { retryable: false },
      },
    });
  });

  test("runs watch --json streams live AI Assist run events when available", async () => {
    const h = harness({
      orchestration: {
        watchRun: async function* () {
          yield {
            type: "tool_call",
            runId: "run-1",
            toolName: "Read",
            args: { path: "apps/web/src/routes/projects/[id]/runs/[runId]/+page.svelte" },
            resultStatus: "ok",
          };
          yield {
            type: "approval",
            runId: "run-1",
            status: "pending",
          };
        },
      },
    });

    await runPillar14Command("runs", ["watch", "run-1", "--json"], h.opts);

    // Streaming command: one canonical `fulcrum.cli.v1` envelope per JSONL
    // line, then a `{schema,result:null,end:true,trace_id}` end sentinel.
    const lines = h.out.map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      schema: "fulcrum.cli.v1",
      command: "fulcrum runs watch",
      result: { type: "tool_call", toolName: "Read", resultStatus: "ok" },
    });
    expect(lines[1]).toMatchObject({
      schema: "fulcrum.cli.v1",
      result: { type: "approval", status: "pending" },
    });
    expect(lines[2]).toEqual({
      schema: "fulcrum.cli.v1",
      result: null,
      end: true,
      trace_id: lines[0].trace_id,
    });
    // Every streamed line shares one trace id.
    expect(lines[1].trace_id).toBe(lines[0].trace_id);
  });
});
