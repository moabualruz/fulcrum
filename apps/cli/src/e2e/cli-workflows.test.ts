import { describe, expect, test } from "bun:test";

import {
  createManualSimulationWorkspace,
  DEFAULT_CROSS_SURFACE_JOURNEYS,
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
    // `fulcrum task` verbs wrap `--json` output in the canonical fulcrum.cli.v1
    // envelope (CLI-TUI-UX §3); the payload is `.result` (prd-cli-build-stage-parity).
    expect(io.out.map((line) => {
      const envelope = JSON.parse(line) as { schema: string; result: unknown };
      expect(envelope.schema).toBe("fulcrum.cli.v1");
      return envelope.result;
    })).toEqual([
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
      // `artifact list --json` emits the canonical fulcrum.cli.v1 envelope
      // (prd-cli-ship-stage-parity); the artifact rows are under `.result`.
      const artifactEnvelope = JSON.parse(result.stdout) as { schema: string; result: unknown };
      expect(artifactEnvelope.schema).toBe("fulcrum.cli.v1");
      expect(artifactEnvelope.result).toEqual([{ id: "artifact-1", filename: "manual-proof.txt" }]);
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

  test("cross-surface manual journeys name CLI commands, TUI keys, state, and evidence", async () => {
    expect(DEFAULT_CROSS_SURFACE_JOURNEYS.map((journey) => journey.id)).toEqual([
      "pm-only-planning",
      "agent-run-supervision",
      "docs-context-handoff",
      "review-uat-final-qa",
      "integration-notification-loop",
    ]);

    for (const journey of DEFAULT_CROSS_SURFACE_JOURNEYS) {
      expect(journey.projectId).toBeTruthy();
      expect(journey.traceId).toBeTruthy();
      expect(journey.steps.length).toBeGreaterThanOrEqual(2);
      expect(journey.steps.some((step) => step.surface === "cli" && step.cliCommand?.[0] === "fulcrum")).toBe(true);
      expect(journey.steps.some((step) => step.surface === "tui" && (step.tuiKeys?.length ?? 0) > 0)).toBe(true);

      for (const step of journey.steps) {
        expect(step.expectedPersistedState.length).toBeGreaterThan(0);
        expect(step.evidenceArtifacts.length).toBeGreaterThan(0);
        expect(step.expectedPersistedState.join(" ")).toMatch(new RegExp(`${journey.projectId}|${journey.traceId}`));
      }
    }
  });

  test("manual simulation evidence persists journey continuity across surfaces", async () => {
    const workspace = await createManualSimulationWorkspace("cross-surface-journeys");
    try {
      const evidencePath = await writeManualSimulationEvidence({
        workspace,
        journeys: DEFAULT_CROSS_SURFACE_JOURNEYS,
      });
      const evidence = await readManualSimulationEvidence(evidencePath);

      expect(evidence.journeys).toHaveLength(5);
      expect(evidence.journeys.every((journey) => journey.steps.some((step) => step.surface === "cli"))).toBe(true);
      expect(evidence.journeys.every((journey) => journey.steps.some((step) => step.surface === "tui"))).toBe(true);
      expect(evidence.artifacts).toEqual(
        DEFAULT_CROSS_SURFACE_JOURNEYS.flatMap((journey) =>
          journey.steps.flatMap((step) => step.evidenceArtifacts)
        ),
      );
    } finally {
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
