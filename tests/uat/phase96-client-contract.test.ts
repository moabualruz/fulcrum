import { describe, expect, test } from "bun:test";

import { runPillar14Command } from "../../apps/cli/src/commands/pillar14-generated.ts";
import { run as runWorkCommand } from "../../apps/cli/src/commands/work.ts";
import { PHASE96_UAT_FIXTURE, phase96FixtureIds } from "./phase96-fixture.ts";

function cliHarness(caller: unknown) {
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

describe("Phase 09.6 canonical UAT client contract", () => {
  test("CLI work create forwards canonical scoped task creation", async () => {
    const ids = phase96FixtureIds();
    const calls: unknown[] = [];
    const h = cliHarness({
      work: {
        create: async (input: unknown) => {
          calls.push(input);
          return {
            task: PHASE96_UAT_FIXTURE.workItems.find((item) => item.id === ids.taskId),
            links: { docs: [PHASE96_UAT_FIXTURE.document] },
            trace: {
              projectId: ids.childProjectId,
              entity: { kind: "work_item", id: ids.taskId },
              sourceRefs: PHASE96_UAT_FIXTURE.trace.sourceRefs,
            },
          };
        },
      },
    });

    await runWorkCommand([
      "create",
      "--title",
      "Dispatch reviewed agent run",
      "--type",
      "task",
      "--parent",
      ids.epicId,
      "--project",
      ids.childProjectId,
      "--json",
    ], h.opts);

    expect(calls).toEqual([
      {
        title: "Dispatch reviewed agent run",
        taskType: "task",
        parentId: ids.epicId,
        projectId: ids.childProjectId,
      },
    ]);
    expect(JSON.parse(h.out[0] ?? "{}")).toMatchObject({
      task: { id: ids.taskId, projectId: ids.childProjectId },
      trace: { projectId: ids.childProjectId, entity: { kind: "work_item", id: ids.taskId } },
    });
  });

  test("CLI run dispatch and watch preserve canonical run trace", async () => {
    const ids = phase96FixtureIds();
    const dispatch = cliHarness({
      orchestration: {
        dispatchRun: async (input: unknown) => ({
          runId: ids.runId,
          state: "queued",
          agent: "codex",
          input,
          trace: {
            task: { id: ids.taskId, projectId: ids.childProjectId },
            context: {
              id: ids.contextBundleId,
              sourceRefs: PHASE96_UAT_FIXTURE.trace.sourceRefs,
            },
            authority: { trustMode: "assisted", approvalRequired: false },
          },
        }),
      },
    });

    await runPillar14Command("runs", ["dispatch", "--task", ids.taskId, "--agent", "codex", "--json"], dispatch.opts);

    expect(JSON.parse(dispatch.out[0] ?? "{}")).toMatchObject({
      runId: ids.runId,
      trace: {
        task: { id: ids.taskId, projectId: ids.childProjectId },
        context: { id: ids.contextBundleId },
        authority: { trustMode: "assisted" },
      },
    });

    const watch = cliHarness({
      orchestration: {
        getRun: async () => ({
          id: ids.runId,
          state: "succeeded",
          observability: {
            context: { id: ids.contextBundleId, sourceRefs: PHASE96_UAT_FIXTURE.trace.sourceRefs },
            artifacts: [PHASE96_UAT_FIXTURE.artifact],
            memory: [PHASE96_UAT_FIXTURE.memory],
            audit: [PHASE96_UAT_FIXTURE.auditEvent],
            recovery: { retryable: false },
          },
        }),
      },
    });

    await runPillar14Command("runs", ["watch", ids.runId, "--json"], watch.opts);

    expect(JSON.parse(watch.out[0] ?? "{}")).toMatchObject({
      id: ids.runId,
      state: "succeeded",
      observability: {
        context: { id: ids.contextBundleId },
        artifacts: [{ id: ids.artifactId, runId: ids.runId }],
        memory: [{ id: ids.memoryId, sourceRunId: ids.runId }],
        audit: [{ id: ids.auditEventId, runId: ids.runId }],
      },
    });
  });
});
