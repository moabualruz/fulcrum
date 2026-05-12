import { describe, expect, it } from "bun:test";
import { run as runArtifact } from "../../apps/cli/src/artifact.ts";
import { formatConnectorRuns, formatConnectorsList, run as runConnectors } from "../../apps/cli/src/connectors.ts";
import { run as runNotify } from "../../apps/cli/src/notify.ts";
import { run as runSymphony, stubCaller, type SymphonyCaller } from "../../apps/cli/src/symphony.ts";

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exits: number[] = [];
  return {
    stdout,
    stderr,
    exits,
    opts: {
      print: (line: string) => stdout.push(line),
      printErr: (line: string) => stderr.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

describe("artifact CLI source", () => {
  it("lists, shows, validates, and reports artifact command errors", async () => {
    const calls: unknown[] = [];
    const caller = {
      artifacts: {
        list: async () => [{ id: "a1", filename: "log.txt" }],
        get: async (input: { id: string }) => {
          calls.push(input);
          return { id: input.id, filename: "log.txt" };
        },
      },
    };
    const a = io();
    await runArtifact(["list"], { caller, ...a.opts });
    await runArtifact(["list", "--json"], { caller, ...a.opts });
    await runArtifact(["show", "a1"], { caller, ...a.opts });
    await runArtifact(["show"], { caller, ...a.opts });
    await runArtifact(["show", "a1", "--bad"], { caller, ...a.opts });
    await runArtifact(["wat"], { caller, ...a.opts });

    expect(a.stdout.join("\n")).toContain("log.txt\ta1");
    expect(a.stdout.join("\n")).toContain("\"filename\": \"log.txt\"");
    expect(calls).toEqual([{ id: "a1" }]);
    expect(a.stderr.join("\n")).toContain("usage: fulcrum artifact show <id>");
    expect(a.stderr.join("\n")).toContain("unknown flag: --bad");
    expect(a.stderr.join("\n")).toContain("unknown verb 'wat'");
    expect(a.exits).toEqual([2, 2, 2]);
  });
});

describe("connectors CLI source", () => {
  it("formats connector lists and runs and handles command validation", async () => {
    expect(formatConnectorsList([], false)).toBe("No connectors configured.");
    expect(formatConnectorsList([{ kind: "linear", enabled: true, lastSyncAt: null }], false)).toContain("linear  ON");
    expect(formatConnectorRuns([], false)).toBe("No runs found.");
    expect(formatConnectorRuns([{ kind: "linear", status: "done", started_at: "now", records_synced: 3 }], false)).toContain("3 records");

    const caller = {
      connectors: {
        list: async () => [{ kind: "linear", enabled: false, lastSyncAt: "today" }],
        runs: { list: async () => [{ kind: "linear", status: "ok", startedAt: "now", recordsSynced: 1 }] },
      },
    };
    const c = io();
    await runConnectors(["help"], { caller, ...c.opts });
    await runConnectors(["list"], { caller, ...c.opts });
    await runConnectors(["list", "--json"], { caller, ...c.opts });
    await runConnectors(["runs", "linear"], { caller, ...c.opts });
    await runConnectors(["runs"], { caller, ...c.opts });
    await runConnectors(["list", "--bad"], { caller, ...c.opts });
    await runConnectors(["wat"], { caller, ...c.opts });

    expect(c.stdout.join("\n")).toContain("usage: fulcrum connectors");
    expect(c.stdout.join("\n")).toContain("linear  OFF");
    expect(c.stdout.join("\n")).toContain("\"kind\": \"linear\"");
    expect(c.stderr.join("\n")).toContain("usage: fulcrum connectors runs <kind>");
    expect(c.stderr.join("\n")).toContain("unknown flag: --bad");
    expect(c.exits).toEqual([2, 2, 2]);
  });
});

describe("notify CLI source", () => {
  function caller() {
    return {
      notify: {
        list: async (input: unknown) => ({ list: input }),
        markRead: async (input: unknown) => ({ markRead: input }),
        markAllRead: async () => ({ all: true }),
        mute: async (input: unknown) => ({ mute: input }),
        unmute: async (input: unknown) => ({ unmute: input }),
        rules: {
          list: async () => [{ id: "r1" }],
          get: async ({ id }: { id: string }) => id === "missing" ? null : { id },
          create: async (input: unknown) => ({ create: input }),
          update: async (input: unknown) => ({ update: input }),
          delete: async (input: unknown) => ({ delete: input }),
        },
        channels: {
          list: async () => ["email"],
          config: async (input: unknown) => ({ config: input }),
          test: async (input: unknown) => ({ test: input }),
        },
      },
    };
  }

  it("covers notification verbs, rule/channel subcommands, and usage errors", async () => {
    const n = io();
    const opts = { caller: caller(), ...n.opts };
    await runNotify(["help"], opts);
    await runNotify(["list", "--unread", "--limit", "5", "--offset", "2", "--json"], opts);
    await runNotify(["mark-read", "--all"], opts);
    await runNotify(["read", "n1"], opts);
    await runNotify(["mute", "task", "t1", "--until", "2026-05-01T00:00:00.000Z"], opts);
    await runNotify(["unmute", "task", "t1"], opts);
    await runNotify(["rules", "list"], opts);
    await runNotify(["rules", "get", "r1"], opts);
    await runNotify(["rules", "get", "missing"], opts);
    await runNotify(["rules", "create", "--name", "Mine", "--pattern", "{\"verb\":\"task.created\"}", "--channels", "email,slack"], opts);
    await runNotify(["rules", "update", "r1"], opts);
    await runNotify(["rules", "delete", "r1"], opts);
    await runNotify(["channels", "list"], opts);
    await runNotify(["channels", "config", "email", "--url", "smtp://local"], opts);
    await runNotify(["channels", "test", "email"], opts);
    await runNotify(["mark-read"], opts);
    await runNotify(["mute", "task"], opts);
    await runNotify(["rules"], opts);
    await runNotify(["channels"], opts);
    await runNotify(["list", "--bad"], opts);
    await runNotify(["list", "--limit", "bad"], opts);
    await runNotify(["wat"], opts);

    const out = n.stdout.join("\n");
    expect(out).toContain("fulcrum notify - notification management");
    expect(out).toContain("\"all\": true");
    expect(out).toContain("\"markRead\"");
    expect(out).toContain("\"channels\": [");
    const err = n.stderr.join("\n");
    expect(err).toContain("rule not found: missing");
    expect(err).toContain("usage: fulcrum notify mark-read");
    expect(err).toContain("usage: fulcrum notify mute");
    expect(err).toContain("unknown flag: --bad");
    expect(err).toContain("--limit must be an integer");
    expect(err).toContain("unknown verb 'wat'");
    expect(n.exits).toEqual([1, 2, 2, 2, 2, 2, 1, 2]);
  });
});

describe("symphony CLI source", () => {
  function symphonyCaller(): SymphonyCaller {
    return {
      ...stubCaller(),
      getOrchestratorStatus: async () => ({ running: 1, queued: 2, stalled: 3 }),
      syncDaily: async () => ({ synced: 4, errors: 0 }),
      listRuns: async () => [{ id: "run-1", state: "ready", attemptCount: 2, startedAt: "now" }],
      getRun: async ({ runId }) => runId === "missing" ? null : {
        id: runId,
        state: "failed",
        attemptCount: 2,
        nextRetryAt: new Date("2026-05-01T00:00:00.000Z"),
        lastErrorKind: "agent",
        workspacePath: "/tmp/ws",
        renderedPrompt: "x".repeat(300),
      },
      cancelRun: async () => ({ success: true }),
      retryRun: async () => ({ success: false }),
      dispatchRun: async (input) => ({ runId: input.taskId, state: "queued", agent: input.agentName ?? "codex", sandboxMode: input.sandboxMode ?? "none" }),
    };
  }

  it("covers status, sync, run actions, conformance, and usage failures", async () => {
    const s = io();
    const opts = { caller: symphonyCaller(), ...s.opts };
    await runSymphony(["help"], opts);
    await runSymphony(["status"], opts);
    await runSymphony(["status", "--json"], opts);
    await runSymphony(["sync"], opts);
    await runSymphony(["sync", "--json"], opts);
    await runSymphony(["runs", "list", "--state", "ready", "--project", "p1"], opts);
    await runSymphony(["runs", "list", "--json"], opts);
    await runSymphony(["runs", "show", "run-1", "--verbose"], opts);
    await runSymphony(["runs", "show", "run-1", "--json"], opts);
    await runSymphony(["runs", "show", "missing"], opts);
    await runSymphony(["runs", "cancel", "run-1"], opts);
    await runSymphony(["runs", "cancel", "run-1", "--json"], opts);
    await runSymphony(["runs", "retry", "run-1"], opts);
    await runSymphony(["runs", "retry", "run-1", "--json"], opts);
    await runSymphony(["runs", "dispatch", "task-1", "--agent", "claude", "--sandbox", "dry"], opts);
    await runSymphony(["runs", "dispatch", "task-1", "--json"], opts);
    await runSymphony(["conformance", "--verbose"], { ...opts, runConformanceCheck: async () => ({ pass: false, sections: [{ section: "18.1", pass: false, reason: "missing" }] }) });
    await runSymphony(["conformance", "--json"], { ...opts, runConformanceCheck: async () => ({ pass: true, sections: [] }) });
    await runSymphony(["runs", "show"], opts);
    await runSymphony(["runs", "cancel"], opts);
    await runSymphony(["runs", "retry"], opts);
    await runSymphony(["runs", "dispatch"], opts);
    await runSymphony(["runs", "wat"], opts);
    await runSymphony(["wat"], opts);

    const out = s.stdout.join("\n");
    expect(out).toContain("Symphony Orchestrator Status");
    expect(out).toContain("\"running\":1");
    expect(out).toContain("Synced 4 items");
    expect(out).toContain("RENDERED PROMPT");
    expect(out).toContain("Cancelled run run-1");
    expect(out).toContain("Failed to retry run run-1");
    expect(out).toContain("Dispatched run task-1");
    expect(out).toContain("FAIL  18.1");
    const err = s.stderr.join("\n");
    expect(err).toContain("run not found 'missing'");
    expect(err).toContain("conformance: FAIL");
    expect(err).toContain("missing <runId>");
    expect(err).toContain("missing <taskId>");
    expect(err).toContain("unknown command 'wat'");
    expect(s.exits).toEqual([1, 1, 2, 2, 2, 2, 2, 2]);
  });
});
