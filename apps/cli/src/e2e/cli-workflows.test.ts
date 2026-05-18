import { describe, expect, test } from "bun:test";

import {
  createManualSimulationWorkspace,
  readManualSimulationEvidence,
  runCliSimulation,
  startFakeJsonApi,
  writeManualSimulationEvidence,
} from "@platform-core/application/manual-simulation/harness.ts";
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

  test("manual simulation harness runs CLI command with temp HOME, fake API, and evidence log", async () => {
    const workspace = await createManualSimulationWorkspace("cli-workflow");
    const api = startFakeJsonApi((request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/v1/artifacts") {
        return Response.json([{ id: "artifact-1", filename: "manual-proof.txt" }]);
      }
      return Response.json([]);
    });

    try {
      const result = await runCliSimulation({
        workspace,
        api,
        argv: ["artifacts", "list", "--json"],
      });
      const evidencePath = await writeManualSimulationEvidence({ workspace, api, cli: [result] });
      const evidence = await readManualSimulationEvidence(evidencePath);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([{ id: "artifact-1", filename: "manual-proof.txt" }]);
      expect(result.stderr).toBe("");
      expect(result.evidencePath).toContain(workspace.logsDir);
      expect(api.requests.map((request) => `${request.method} ${request.path}`)).toEqual(["GET /api/v1/artifacts"]);
      expect(evidence).toMatchObject({
        schema: "fulcrum.manual-simulation.v1",
        id: "cli-workflow",
        tempHome: workspace.homeDir,
        fakeApiUrl: api.url,
      });
      expect(evidence.artifacts).toContain(result.evidencePath);
    } finally {
      api.stop(true);
      await workspace.cleanup();
    }
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
