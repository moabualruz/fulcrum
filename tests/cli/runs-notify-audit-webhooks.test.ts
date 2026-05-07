import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  return {
    runs: {
      list: async (input: { status?: string }) => input.status === "running" ? [runningRun] : [],
      cancel: async (input: { id: string }) => ({ id: input.id, status: "cancelled" }),
    },
    notify: {
      list: async (input: { unread?: boolean }) => ({
        items: input.unread ? [{ id: "n-1", read: false, title: "Build done" }] : [],
        total: input.unread ? 1 : 0,
      }),
      watch: async function* () {
        yield { id: "n-2", read: false, title: "New event" };
      },
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

  it("audit retention set emits JSON", async () => {
    const h = harness();
    await runPillar14Command("audit", ["retention", "set", "--days", "90", "--json"], {
      caller: caller(),
      ...h,
    });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({ retainDays: 90 });
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
});
