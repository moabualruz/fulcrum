// Tests for the audit-log hook — appends shell commands to per-project log.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { existsSync } from "node:fs";

let TMP: string;
let SLUG: string;
let LOG: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-audit-"));
  SLUG = basename(TMP);
  LOG = join(TMP, ".fulcrum", "state", SLUG, "shell-commands.log");
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function readLogLines(): Promise<string[]> {
  if (!existsSync(LOG)) return [];
  const text = await readFile(LOG, "utf8");
  return text.length === 0 ? [] : text.split("\n").filter((l) => l.length > 0);
}

async function runAudit(envelope: object): Promise<{ stdout: string; exit: number; stderr: string }> {
  const json = JSON.stringify(envelope);
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, json);
  // Run from inside TMP so projectSlug() resolves to TMP's basename.
  const proc = Bun.spawn(["bun", "src/index.ts", "hook", "audit-log"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: TMP, CLAUDE_PROJECT_DIR: TMP },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, exit, stderr };
}

describe("audit-log", () => {
  test("command + exit_code → log line ends with \\tcmd\\t<exit>\\n", async () => {
    const before = await readLogLines();
    const r = await runAudit({
      tool_name: "Bash",
      tool_input: { command: "ls -la" },
      tool_response: { exit_code: 0 },
    });
    expect(r.exit).toBe(0);
    const after = await readLogLines();
    expect(after.length).toBe(before.length + 1);
    const line = after[after.length - 1]!;
    expect(line.endsWith("\tls -la\t0")).toBe(true);
  });

  test("tab in command is replaced with space", async () => {
    const before = await readLogLines();
    const r = await runAudit({
      tool_name: "Bash",
      tool_input: { command: "echo\thi" },
      tool_response: { exit_code: 0 },
    });
    expect(r.exit).toBe(0);
    const after = await readLogLines();
    expect(after.length).toBe(before.length + 1);
    const line = after[after.length - 1]!;
    // Three tabs total: timestamp\tcmd\texit
    expect(line.split("\t").length).toBe(3);
    expect(line).toContain("echo hi");
  });

  test("no command → no log line written", async () => {
    const before = await readLogLines();
    const r = await runAudit({
      tool_name: "Bash",
      tool_input: {},
      tool_response: { exit_code: 0 },
    });
    expect(r.exit).toBe(0);
    const after = await readLogLines();
    expect(after.length).toBe(before.length);
  });

  test("returncode (Codex shape) honored when exit_code absent", async () => {
    const before = await readLogLines();
    const r = await runAudit({
      tool_name: "Bash",
      tool_input: { command: "false" },
      tool_response: { returncode: 7 },
    });
    expect(r.exit).toBe(0);
    const after = await readLogLines();
    expect(after.length).toBe(before.length + 1);
    const line = after[after.length - 1]!;
    expect(line.endsWith("\tfalse\t7")).toBe(true);
  });
});
