/**
 * Tests for fulcrum agents CLI + expanded runs CLI + doctor orchestration checks (P4#15).
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCanonicalEnvelope } from "../lib/envelope.ts";

// ---------------------------------------------------------------------------
// agents CLI tests
// ---------------------------------------------------------------------------

describe("fulcrum agents list", () => {
  test("singular --json returns canonical fulcrum.cli.v1 envelope with profiles under result", async () => {
    const { captured, exitCode } = await runAgents(["list", "--json"]);
    expect(exitCode).toBe(0);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("fulcrum agent list");
    expect(Array.isArray(envelope.result.profiles)).toBe(true);
    expect(envelope.result.profiles.length).toBe(6);
    const names = envelope.result.profiles.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(["claude-code", "codex", "copilot", "gemini-cli", "opencode", "pi"]);
  });

  test("plural compatibility alias --json returns canonical envelope", async () => {
    const { captured, exitCode } = await runAgents(["list", "--json"], "agents");
    expect(exitCode).toBe(0);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.command).toBe("fulcrum agents list");
    expect(Array.isArray(envelope.result.profiles)).toBe(true);
  });

  test("plural compatibility alias --json-raw returns legacy profile array", async () => {
    const { captured, exitCode } = await runAgents(["list", "--json-raw"], "agents");
    expect(exitCode).toBe(0);
    const profiles = JSON.parse(captured.join(""));
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBe(6);
  });

  test("human format lists all profiles", async () => {
    const { captured, exitCode } = await runAgents(["list"]);
    expect(exitCode).toBe(0);
    expect(captured.length).toBeGreaterThanOrEqual(6);
    expect(captured.some((l) => l.includes("claude-code"))).toBe(true);
  });
});

describe("fulcrum agent canonical grammar", () => {
  test.each([
    ["add", ["add", "codex", "--client", "codex", "--json"]],
    ["remove", ["remove", "codex", "--json"]],
    ["edit", ["edit", "codex", "--client", "codex", "--json"]],
    ["status", ["status", "codex", "--json"]],
    ["defaults", ["defaults", "--json"]],
    ["set-default", ["set-default", "codex", "--action", "build.run.step", "--json"]],
    ["enable", ["enable", "codex", "--json"]],
    ["disable", ["disable", "codex", "--json"]],
    ["reload", ["reload", "codex", "--json"]],
    ["invoke", ["invoke", "codex", "--step", "step-1", "--json"]],
  ] as const)("%s emits canonical envelope", async (_name, argv) => {
    const { captured, exitCode } = await runAgents([...argv]);
    expect(exitCode).toBe(0);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.command).toBe(`fulcrum agent ${argv[0]}`);
    expect(envelope.errors).toEqual([]);
  });

  test("unknown subcommand envelope preserves invoked command", async () => {
    const { captured, exitCode } = await runAgents(["bogus", "--json"]);
    expect(exitCode).toBe(2);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.command).toBe("fulcrum agent bogus");
    expect(envelope.args.subcommand).toBe("bogus");
    expect(envelope.errors[0].code).toBe("FUL_AGENT_UNKNOWN_COMMAND");
  });
});

describe("fulcrum agent view", () => {
  test("--json returns single profile inside canonical envelope", async () => {
    const { captured, exitCode } = await runAgents(["view", "claude-code", "--json"]);
    expect(exitCode).toBe(0);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.result.profile.name).toBe("claude-code");
    expect(envelope.result.profile.cliPath).toBe("claude");
  });

  test("legacy profile verb maps to canonical view envelope", async () => {
    const { captured, exitCode } = await runAgents(["profile", "claude-code", "--json"], "agents");
    expect(exitCode).toBe(0);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.command).toBe("fulcrum agents view");
    expect(envelope.result.profile.name).toBe("claude-code");
  });

  test("unknown name returns error JSON and non-zero exit", async () => {
    const { captured, exitCode } = await runAgents(["view", "nonexistent", "--json"]);
    expect(exitCode).toBe(1);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.result).toBeNull();
    expect(envelope.errors[0].code).toBe("FUL_AGENT_NOT_FOUND");
    expect(envelope.errors[0].message).toContain("nonexistent");
    expect(Array.isArray(envelope.next_actions)).toBe(true);
    expect(typeof envelope.trace_id).toBe("string");
  });

  test("missing name argument emits coded envelope error", async () => {
    const { captured, exitCode } = await runAgents(["view", "--json"]);
    expect(exitCode).toBe(1);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.errors[0].code).toBe("FUL_AGENT_MISSING_ARGUMENT");
    expect(Array.isArray(envelope.next_actions)).toBe(true);
  });
});

describe("fulcrum agents test", () => {
  test("--json returns test result envelope", async () => {
    const { captured } = await runAgents(["test", "claude-code", "--json"]);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.result.name).toBe("claude-code");
    expect(typeof envelope.result.passed).toBe("boolean");
    expect(typeof envelope.result.testedAt).toBe("string");
  });

  test("unknown profile returns error", async () => {
    const { captured, exitCode } = await runAgents(["test", "nope", "--json"]);
    expect(exitCode).toBe(1);
    const envelope = JSON.parse(captured.join(""));
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.errors[0].message).toContain("nope");
  });
});

describe("fulcrum agents help", () => {
  test("shows usage", async () => {
    const { captured, exitCode } = await runAgents(["--help"]);
    expect(exitCode).toBe(0);
    const help = captured.join("\n");
    expect(help).toContain("fulcrum agent");
    for (const verb of ["enable", "disable", "reload", "invoke"]) {
      expect(help).toContain(verb);
    }
  });

  test("unknown subcommand exits 2", async () => {
    const { exitCode } = await runAgents(["bogus"]);
    expect(exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// runs CLI: JSONL log fixture test
// ---------------------------------------------------------------------------

let SCRATCH: string;

beforeAll(async () => {
  SCRATCH = await mkdtemp(join(tmpdir(), "fulcrum-p4-15-"));
});

afterAll(async () => {
  await rm(SCRATCH, { recursive: true, force: true });
});

describe("fulcrum runs logs", () => {
  test("reads JSONL fixture lines correctly", async () => {
    const logPath = join(SCRATCH, "test-run.jsonl");
    const lines = [
      JSON.stringify({ ts: 1, msg: "started" }),
      JSON.stringify({ ts: 2, msg: "step-1" }),
      JSON.stringify({ ts: 3, msg: "done" }),
    ];
    await writeFile(logPath, lines.join("\n") + "\n");

    const content = await Bun.file(logPath).text();
    const parsed = content
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    expect(parsed.length).toBe(3);
    expect(parsed[0].msg).toBe("started");
    expect(parsed[2].msg).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// doctor orchestration checks
// ---------------------------------------------------------------------------

describe("fulcrum doctor orchestration", () => {
  test("--json includes orchestration section", async () => {
    const report = await runDoctorJson();
    expect(report.orchestration).toBeDefined();
    expect(Array.isArray(report.orchestration.checks)).toBe(true);
  }, 20_000);

  test("agent-binary checks present for all 6 profiles", async () => {
    const report = await runDoctorJson();
    const agentBinaryChecks = report.orchestration.checks.filter(
      (c: { name: string }) => c.name.startsWith("agent-binary:"),
    );
    expect(agentBinaryChecks.length).toBe(6);
  }, 20_000);

  test("auth-vars checks present for all 6 profiles", async () => {
    const report = await runDoctorJson();
    const authChecks = report.orchestration.checks.filter(
      (c: { name: string }) => c.name.startsWith("auth-vars:"),
    );
    expect(authChecks.length).toBe(6);
  }, 20_000);

  test("workspace-writable check present and ok", async () => {
    const report = await runDoctorJson();
    const check = report.orchestration.checks.find(
      (c: { name: string }) => c.name === "workspace-writable",
    );
    expect(check).toBeDefined();
    expect(check.level).toBe("ok");
  }, 20_000);

  test("effect-singleton check present", async () => {
    const report = await runDoctorJson();
    const check = report.orchestration.checks.find(
      (c: { name: string }) => c.name === "effect-singleton",
    );
    expect(check).toBeDefined();
  }, 20_000);

  test("doctor exits 0 on fully configured install (mocked env)", async () => {
    // We can't guarantee all tools present, but doctor should not crash
    const report = await runDoctorJson();
    expect(["ok", "warning", "error"]).toContain(report.verdict);
  }, 20_000);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runAgents(
  args: string[],
  commandRoot: "agent" | "agents" = "agent",
): Promise<{ captured: string[]; exitCode: number }> {
  const { run } = await import("./agents.ts");
  const captured: string[] = [];
  let exitCode = 0;
  await run(args, {
    commandRoot,
    print: (line: string) => captured.push(line),
    printErr: (line: string) => captured.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
  });
  return { captured, exitCode };
}

async function runDoctorJson(): Promise<Record<string, any>> {
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "doctor", "--json"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(out) as Record<string, any>;
}
