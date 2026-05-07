// Tests for the pm-policy hook — refuses npm/yarn when repo declares pnpm/bun.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let TMP: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-pm-policy-"));
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function clearLockfiles() {
  for (const f of ["pnpm-lock.yaml", "bun.lockb", "bun.lock", "yarn.lock"]) {
    try { await unlink(join(TMP, f)); } catch {}
  }
}

async function runPmPolicy(envelope: object): Promise<{ stdout: string; exit: number; stderr: string }> {
  const json = JSON.stringify(envelope);
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, json);
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "hook", "pm-policy"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CLAUDE_PROJECT_DIR: TMP, HOME: TMP },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, exit, stderr };
}

describe("pm-policy", () => {
  test("pnpm lockfile + npm install → exit 2 with pnpm message", async () => {
    await clearLockfiles();
    await writeFile(join(TMP, "pnpm-lock.yaml"), "");
    const r = await runPmPolicy({
      tool_name: "Bash",
      tool_input: { command: "npm install" },
    });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("this repo uses pnpm");
  });

  test("bun lockfile + yarn add foo → exit 2 with bun message", async () => {
    await clearLockfiles();
    await writeFile(join(TMP, "bun.lock"), "");
    const r = await runPmPolicy({
      tool_name: "Bash",
      tool_input: { command: "yarn add foo" },
    });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("this repo uses bun");
  });

  test("bun lockfile + npm install → exit 2", async () => {
    await clearLockfiles();
    await writeFile(join(TMP, "bun.lockb"), "");
    const r = await runPmPolicy({
      tool_name: "Bash",
      tool_input: { command: "npm install" },
    });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("this repo uses bun");
  });

  test("yarn lockfile only + npm install → exit 2", async () => {
    await clearLockfiles();
    await writeFile(join(TMP, "yarn.lock"), "");
    const r = await runPmPolicy({
      tool_name: "Bash",
      tool_input: { command: "npm install" },
    });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("this repo uses yarn");
  });

  test("no lockfile → exit 0 (no-op)", async () => {
    await clearLockfiles();
    const r = await runPmPolicy({
      tool_name: "Bash",
      tool_input: { command: "npm install" },
    });
    expect(r.exit).toBe(0);
  });

  test("token-boundary guard — 'mynpm-tool foo' with pnpm lockfile → exit 0", async () => {
    await clearLockfiles();
    await writeFile(join(TMP, "pnpm-lock.yaml"), "");
    const r = await runPmPolicy({
      tool_name: "Bash",
      tool_input: { command: "mynpm-tool foo" },
    });
    expect(r.exit).toBe(0);
  });

  test("empty/missing command → exit 0", async () => {
    await clearLockfiles();
    await writeFile(join(TMP, "pnpm-lock.yaml"), "");
    const r1 = await runPmPolicy({ tool_name: "Bash", tool_input: { command: "" } });
    expect(r1.exit).toBe(0);
    const r2 = await runPmPolicy({ tool_name: "Bash", tool_input: {} });
    expect(r2.exit).toBe(0);
  });
});
