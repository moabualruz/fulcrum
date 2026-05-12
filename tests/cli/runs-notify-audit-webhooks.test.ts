import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

import { runPillar14Command } from "@fulcrum/cli/commands/pillar14-generated.ts";

type Harness = {
  lines: string[];
  errLines: string[];
  exitCode?: number;
  print: (line: string) => void;
  printErr: (line: string) => void;
  exit: (code: number) => void;
};

function harness(): Harness {
  const h: Harness = {
    lines: [],
    errLines: [],
    print: (line) => h.lines.push(line),
    printErr: (line) => h.errLines.push(line),
    exit: (code) => {
      h.exitCode = code;
    },
  };
  return h;
}

const runningRun = {
  id: "run-1",
  org_id: "org-1",
  status: "running",
  claim_state: "claimed",
  claimed_by: "agent-1",
};

const auditEvent = {
  id: "evt-1",
  org_id: "org-1",
  kind: "task",
  created_at: "2026-01-02T00:00:00.000Z",
};

function caller() {
  const flags = new Map([["router-llm", false]]);
  const runs = new Map<string, any>([
    ["run-1", { ...runningRun, transcript_path: "" }],
    ["run-with-log", { id: "run-with-log", status: "succeeded", transcript_path: "" }],
  ]);
  return {
    runs: {
      list: async (input: { status?: string }) => input.status === "running" ? [runningRun] : [],
      get: async (input: { id: string }) => runs.get(input.id) ?? null,
      cancel: async (input: { id: string }) => ({ id: input.id, status: "cancelled" }),
      retry: async (input: { id: string }) => ({ id: `${input.id}-retry`, status: "retry_queued" }),
    },
    orchestration: {
      dispatchRun: async (input: { taskId: string; agentName?: string }) => ({
        id: "run-dispatched",
        taskId: input.taskId,
        agentName: input.agentName ?? null,
      }),
      getRun: async (input: { runId: string }) => runs.get(input.runId) ?? null,
    },
    notify: {
      list: async (input: { unread?: boolean }) => ({
        items: input.unread ? [{ id: "n-1", read: false, title: "Build done" }] : [],
        total: input.unread ? 1 : 0,
      }),
      watch: async function* () {
        yield { id: "n-2", read: false, title: "New event" };
      },
      markRead: async (input: { id: string }) => ({ id: input.id, read: true }),
      markAllRead: async () => ({ updated: 3 }),
      mute: async (input: { subjectKind: string; subjectId: string; mutedUntil?: Date }) => ({
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        mutedUntil: input.mutedUntil?.toISOString(),
      }),
    },
    audit: {
      query: async (input: { kind?: string; since?: Date }) =>
        input.kind === "task" && input.since?.toISOString() === "2026-01-01T00:00:00.000Z"
          ? [auditEvent]
          : [],
      export: async (input: { format: "csv" | "json" }) =>
        input.format === "csv" ? { format: "csv", csv: "id\netc-1\n" } : { format: "json", rows: [auditEvent] },
      retentionPolicy: {
        set: async (input: { retainDays: number }) => ({ retainDays: input.retainDays }),
      },
    },
    webhooks: {
      list: async () => [{ id: "wh-1", url: "https://example.test/hook" }],
      test: async (input: { id: string }) => ({
        id: "del-1",
        webhook_id: input.id,
        payload: { type: "ping" },
      }),
    },
    connectors: {
      enable: async () => {
        const error = new Error("Feature 'connector-jira' is disabled.");
        (error as Error & { code?: string }).code = "FEATURE_DISABLED";
        throw error;
      },
      sync: async (input: { id: string }) => ({ id: "sync-1", connector: input.id, status: "queued" }),
    },
    flags: {
      list: async () => [{ name: "router-llm", enabled: flags.get("router-llm") === true }],
      set: async (input: { flag: string; enabled: boolean }) => {
        flags.set(input.flag, input.enabled);
        return { name: input.flag, enabled: input.enabled };
      },
    },
  };
}

describe("P14#08 generated domain CLI contracts", () => {
  it("help commands print domain-specific usage without resolving a caller", async () => {
    const h = harness();
    await runPillar14Command("runs", ["--help"], { caller: caller(), ...h });
    await runPillar14Command("notify", ["help"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(h.lines[0]).toContain("fulcrum runs");
    expect(h.lines[1]).toContain("fulcrum notify");
  });

  it("runs list filters by status and emits JSON claim fields", async () => {
    const h = harness();
    await runPillar14Command("runs", ["list", "--status", "running", "--json"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual([runningRun]);
  });

  it("runs cancel accepts positional id and emits JSON", async () => {
    const h = harness();
    await runPillar14Command("runs", ["cancel", "run-1", "--json"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({ id: "run-1", status: "cancelled" });
  });

  it("runs show, retry, dispatch, and watch route through the real caller contracts", async () => {
    const h = harness();
    const fakeCaller = caller();

    await runPillar14Command("runs", ["show", "run-1", "--json"], { caller: fakeCaller, ...h });
    await runPillar14Command("runs", ["retry", "--id", "run-1", "--json"], { caller: fakeCaller, ...h });
    await runPillar14Command("runs", ["dispatch", "--task", "task-1", "--agent", "codex", "--json"], {
      caller: fakeCaller,
      ...h,
    });
    await runPillar14Command("runs", ["watch", "run-1", "--json"], { caller: fakeCaller, ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toMatchObject({ id: "run-1", status: "running" });
    expect(JSON.parse(h.lines[1] as string)).toEqual({ id: "run-1-retry", status: "retry_queued" });
    expect(JSON.parse(h.lines[2] as string)).toEqual({
      id: "run-dispatched",
      taskId: "task-1",
      agentName: "codex",
    });
    expect(JSON.parse(h.lines[3] as string)).toMatchObject({ id: "run-1", status: "running" });
  });

  it("runs show and watch report missing runs, and dispatch requires a task id", async () => {
    const h = harness();
    const fakeCaller = caller();

    await runPillar14Command("runs", ["show", "missing", "--json"], { caller: fakeCaller, ...h });
    await runPillar14Command("runs", ["watch", "missing"], { caller: fakeCaller, ...h });
    await runPillar14Command("runs", ["dispatch", "--json"], { caller: fakeCaller, ...h });

    expect(h.exitCode).toBe(1);
    expect(JSON.parse(h.lines[0] as string).error.message).toBe("run 'missing' not found");
    expect(h.errLines).toContain("run 'missing' not found");
    expect(JSON.parse(h.lines[1] as string).error.message).toBe("runs dispatch: missing --task");
  });

  it("runs logs prints existing transcript lines and reports absent logs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-run-logs-"));
    try {
      const logPath = join(dir, "run.jsonl");
      await writeFile(logPath, "{\"event\":\"one\"}\n\n{\"event\":\"two\"}\n", "utf8");
      const fakeCaller = caller();
      const storedRun = await fakeCaller.runs.get({ id: "run-with-log" });
      storedRun.transcript_path = logPath;
      const h = harness();

      await runPillar14Command("runs", ["logs", "run-with-log"], { caller: fakeCaller, ...h });
      await runPillar14Command("runs", ["logs", "run-1"], { caller: fakeCaller, ...h });

      expect(h.lines).toEqual(["{\"event\":\"one\"}", "{\"event\":\"two\"}"]);
      expect(h.exitCode).toBe(1);
      expect(h.errLines).toContain("no log file for run 'run-1'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs attach follows an already terminal run and returns after printing existing logs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-run-attach-"));
    try {
      const logPath = join(dir, "run.jsonl");
      await writeFile(logPath, "{\"event\":\"attached\"}\n", "utf8");
      const fakeCaller = caller();
      const storedRun = await fakeCaller.runs.get({ id: "run-with-log" });
      storedRun.transcript_path = logPath;
      const h = harness();

      await runPillar14Command("runs", ["attach", "--id", "run-with-log"], { caller: fakeCaller, ...h });

      expect(h.exitCode).toBeUndefined();
      expect(h.lines).toEqual(["{\"event\":\"attached\"}"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("notify list --unread --json emits unread notifications", async () => {
    const h = harness();
    await runPillar14Command("notify", ["list", "--unread", "--json"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      items: [{ id: "n-1", read: false, title: "Build done" }],
      total: 1,
    });
  });

  it("notify list --unread --watch streams JSON lines", async () => {
    const h = harness();
    await runPillar14Command("notify", ["list", "--unread", "--watch"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(h.lines.map((line) => JSON.parse(line))).toEqual([
      { id: "n-2", read: false, title: "New event" },
    ]);
  });

  it("notify mark-read, mark-all-read, watch, and mute emit mutation results", async () => {
    const h = harness();
    const fakeCaller = caller();

    await runPillar14Command("notify", ["mark-read", "--id", "n-1", "--json"], { caller: fakeCaller, ...h });
    await runPillar14Command("notify", ["mark-all-read", "--json"], { caller: fakeCaller, ...h });
    await runPillar14Command("notify", ["watch", "--unread"], { caller: fakeCaller, ...h });
    await runPillar14Command("notify", [
      "mute",
      "--subject-kind",
      "task",
      "--subject-id",
      "task-1",
      "--muted-until",
      "2026-01-03T00:00:00.000Z",
      "--json",
    ], { caller: fakeCaller, ...h });

    expect(JSON.parse(h.lines[0] as string)).toEqual({ id: "n-1", read: true });
    expect(JSON.parse(h.lines[1] as string)).toEqual({ updated: 3 });
    expect(JSON.parse(h.lines[2] as string)).toEqual({ id: "n-2", read: false, title: "New event" });
    expect(JSON.parse(h.lines[3] as string)).toEqual({
      subjectKind: "task",
      subjectId: "task-1",
      mutedUntil: "2026-01-03T00:00:00.000Z",
    });
  });

  it("notify list falls back to an empty result when Notification metadata is absent", async () => {
    const h = harness();
    const fakeCaller = caller();
    fakeCaller.notify.list = async () => {
      throw new Error("Metadata for entity Notification not found");
    };

    await runPillar14Command("notify", ["list", "--json"], { caller: fakeCaller, ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual([]);
  });

  it("audit query filters by kind and since", async () => {
    const h = harness();
    await runPillar14Command("audit", ["query", "--kind", "task", "--since", "2026-01-01", "--json"], {
      caller: caller(),
      ...h,
    });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual([auditEvent]);
  });

  it("audit export writes valid JSON to output path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-audit-export-"));
    try {
      const h = harness();
      const output = join(dir, "audit.json");
      await runPillar14Command("audit", ["export", "--format", "json", "--output", output], {
        caller: caller(),
        ...h,
      });

      expect(h.exitCode).toBeUndefined();
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual([auditEvent]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("audit export writes CSV to output path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-audit-export-"));
    try {
      const h = harness();
      const output = join(dir, "audit.csv");
      await runPillar14Command("audit", ["export", "--format", "csv", "--output", output], {
        caller: caller(),
        ...h,
      });

      expect(h.exitCode).toBeUndefined();
      expect(await readFile(output, "utf8")).toBe("id\netc-1\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("audit export normalizes string CSV output and rows-shaped JSON output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-audit-export-shapes-"));
    try {
      const fakeCaller = caller();
      fakeCaller.audit.export = async (input: { format: "csv" | "json" }) =>
        input.format === "csv" ? "id\nshape-1" : { rows: [auditEvent] };
      const csvOut = join(dir, "audit.csv");
      const jsonOut = join(dir, "audit.json");
      const h = harness();

      await runPillar14Command("audit", ["export", "--format", "csv", "--output", csvOut], {
        caller: fakeCaller,
        ...h,
      });
      await runPillar14Command("audit", ["export", "--format", "json", "--output", jsonOut], {
        caller: fakeCaller,
        ...h,
      });

      expect(await readFile(csvOut, "utf8")).toBe("id\nshape-1\n");
      expect(JSON.parse(await readFile(jsonOut, "utf8"))).toEqual([auditEvent]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("audit retention set emits JSON", async () => {
    const h = harness();
    await runPillar14Command("audit", ["retention", "set", "--days", "90", "--json"], {
      caller: caller(),
      ...h,
    });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({ retainDays: 90 });
  });

  it("audit retention rejects invalid days and retention without set subaction", async () => {
    const h = harness();
    await runPillar14Command("audit", ["retention", "set", "--days", "-1", "--json"], {
      caller: caller(),
      ...h,
    });
    await runPillar14Command("audit", ["retention", "show"], {
      caller: caller(),
      ...h,
    });

    expect(h.exitCode).toBe(2);
    expect(JSON.parse(h.lines[0] as string).error.message).toBe("audit retention set: missing --days");
    expect(h.errLines).toContain("fulcrum audit: unknown command 'retention'");
  });

  it("webhooks list emits JSON rows", async () => {
    const h = harness();
    await runPillar14Command("webhooks", ["list", "--json"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual([{ id: "wh-1", url: "https://example.test/hook" }]);
  });

  it("webhooks test creates a ping delivery row", async () => {
    const h = harness();
    await runPillar14Command("webhooks", ["test", "wh-1", "--json"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      id: "del-1",
      webhook_id: "wh-1",
      payload: { type: "ping" },
    });
  });

  it("connectors enable jira returns JSON FeatureDisabledError and exits 1", async () => {
    const h = harness();
    await runPillar14Command("connectors", ["enable", "jira", "--json"], { caller: caller(), ...h });

    expect(h.exitCode).toBe(1);
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      error: {
        code: "FEATURE_DISABLED",
        message: "Feature 'connector-jira' is disabled.",
      },
    });
  });

  it("connectors sync jira emits JSON result", async () => {
    const h = harness();
    await runPillar14Command("connectors", ["sync", "jira", "--json"], { caller: caller(), ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({ id: "sync-1", connector: "jira", status: "queued" });
  });

  it("flags set router-llm on is reflected by flags list", async () => {
    const h = harness();
    const fakeCaller = caller();
    await runPillar14Command("flags", ["set", "router-llm", "on", "--json"], { caller: fakeCaller, ...h });
    await runPillar14Command("flags", ["list", "--json"], { caller: fakeCaller, ...h });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({ name: "router-llm", enabled: true });
    expect(JSON.parse(h.lines[1] as string)).toEqual([{ name: "router-llm", enabled: true }]);
  });

  it("flags set rejects non on/off values and unknown commands exit 2", async () => {
    const h = harness();
    await runPillar14Command("flags", ["set", "router-llm", "maybe", "--json"], { caller: caller(), ...h });
    await runPillar14Command("connectors", ["remove", "jira"], { caller: caller(), ...h });

    expect(JSON.parse(h.lines[0] as string).error.message).toBe("flags set: value must be on or off");
    expect(h.exitCode).toBe(2);
    expect(h.errLines).toContain("fulcrum connectors: unknown command 'remove'");
  });
});
