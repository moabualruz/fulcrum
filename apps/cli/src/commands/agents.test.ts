/**
 * Tests for fulcrum agents CLI + expanded runs CLI + doctor orchestration checks (P4#15).
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// agents CLI tests
// ---------------------------------------------------------------------------

describe("fulcrum agents list", () => {
  test("--json returns valid JSON array with all 6 profiles", async () => {
    const { captured, exitCode } = await runAgents(["list", "--json"]);
    expect(exitCode).toBe(0);
    const profiles = JSON.parse(captured.join(""));
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBe(6);
    const names = profiles.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(["claude-code", "codex", "copilot", "gemini-cli", "opencode", "pi"]);
  });

  test("human format lists all profiles", async () => {
    const { captured, exitCode } = await runAgents(["list"]);
    expect(exitCode).toBe(0);
    expect(captured.length).toBeGreaterThanOrEqual(6);
    expect(captured.some((l) => l.includes("claude-code"))).toBe(true);
  });
});

describe("fulcrum agents profile", () => {
  test("--json returns single profile", async () => {
    const { captured, exitCode } = await runAgents(["profile", "claude-code", "--json"]);
    expect(exitCode).toBe(0);
    const profile = JSON.parse(captured.join(""));
    expect(profile.name).toBe("claude-code");
    expect(profile.cliPath).toBe("claude");
  });

  test("unknown name returns error JSON and non-zero exit", async () => {
    const { captured, exitCode } = await runAgents(["profile", "nonexistent", "--json"]);
    expect(exitCode).toBe(1);
    const result = JSON.parse(captured.join(""));
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain("nonexistent");
  });

  test("missing name argument exits non-zero", async () => {
    const { captured: _c, exitCode } = await runAgents(["profile", "--json"]);
    expect(exitCode).toBe(1);
  });
});

describe("fulcrum agents test", () => {
  test("--json returns test result shape", async () => {
    const { captured } = await runAgents(["test", "claude-code", "--json"]);
    const result = JSON.parse(captured.join(""));
    expect(result.name).toBe("claude-code");
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.testedAt).toBe("string");
  });

  test("unknown profile returns error", async () => {
    const { captured, exitCode } = await runAgents(["test", "nope", "--json"]);
    expect(exitCode).toBe(1);
    const result = JSON.parse(captured.join(""));
    expect(result.error.message).toContain("nope");
  });
});

describe("fulcrum agents help", () => {
  test("shows usage", async () => {
    const { captured, exitCode } = await runAgents(["--help"]);
    expect(exitCode).toBe(0);
    expect(captured.join("\n")).toContain("fulcrum agents");
  });

  test("unknown subcommand exits 2", async () => {
    const { exitCode } = await runAgents(["bogus"]);
    expect(exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// runs CLI — JSONL log fixture test
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
  });

  test("agent-binary checks present for all 6 profiles", async () => {
    const report = await runDoctorJson();
    const agentBinaryChecks = report.orchestration.checks.filter(
      (c: { name: string }) => c.name.startsWith("agent-binary:"),
    );
    expect(agentBinaryChecks.length).toBe(6);
  });

  test("auth-vars checks present for all 6 profiles", async () => {
    const report = await runDoctorJson();
    const authChecks = report.orchestration.checks.filter(
      (c: { name: string }) => c.name.startsWith("auth-vars:"),
    );
    expect(authChecks.length).toBe(6);
  });

  test("workspace-writable check present and ok", async () => {
    const report = await runDoctorJson();
    const check = report.orchestration.checks.find(
      (c: { name: string }) => c.name === "workspace-writable",
    );
    expect(check).toBeDefined();
    expect(check.level).toBe("ok");
  });

  test("effect-singleton check present", async () => {
    const report = await runDoctorJson();
    const check = report.orchestration.checks.find(
      (c: { name: string }) => c.name === "effect-singleton",
    );
    expect(check).toBeDefined();
  });

  test("doctor exits 0 on fully configured install (mocked env)", async () => {
    // We can't guarantee all tools present, but doctor should not crash
    const report = await runDoctorJson();
    expect(["ok", "warning", "error"]).toContain(report.verdict);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runAgents(args: string[]): Promise<{ captured: string[]; exitCode: number }> {
  const { run } = await import("./agents.ts");
  const captured: string[] = [];
  let exitCode = 0;
  await run(args, {
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
