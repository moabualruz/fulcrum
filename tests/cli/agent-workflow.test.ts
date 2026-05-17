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

    await runPillar14Command("runs", ["dispatch", "--task", "task-1", "--agent", "codex", "--json"], h.opts);

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

    await runPillar14Command("runs", ["watch", "run-1", "--json"], h.opts);

    expect(JSON.parse(h.out[0] ?? "{}")).toMatchObject({
      id: "run-1",
      state: "succeeded",
      observability: {
        artifacts: [{ filename: "summary.md" }],
        recovery: { retryable: false },
      },
    });
  });
});
