// Tests for the test-on-edit hook — opt-in glob-driven test runner.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let TMP: string;
let CFG_DIR: string;
let CFG_PATH: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-toe-"));
  CFG_DIR = join(TMP, ".fulcrum");
  CFG_PATH = join(CFG_DIR, "test-on-edit.toml");
  await mkdir(CFG_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function clearConfig() {
  try { await unlink(CFG_PATH); } catch {}
}

async function runTOE(envelope: object): Promise<{ stdout: string; exit: number; stderr: string }> {
  const json = JSON.stringify(envelope);
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, json);
  const env = { ...process.env, CLAUDE_PROJECT_DIR: TMP, HOME: TMP } as Record<string, string>;
  delete env["FULCRUM_DEBUG"];
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "hook", "test-on-edit"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, exit, stderr };
}

describe("test-on-edit", () => {
  test("no .fulcrum/test-on-edit.toml → exit 0 no-op", async () => {
    await clearConfig();
    const file = join(TMP, "x.txt");
    await writeFile(file, "hi\n");
    const r = await runTOE({ tool_name: "Edit", tool_input: { file_path: file } });
    expect(r.exit).toBe(0);
    expect(r.stderr).toBe("");
  });

  test("config matching glob → exit 0 returns immediately", async () => {
    const file = join(TMP, "match.txt");
    await writeFile(file, "hi\n");
    await writeFile(CFG_PATH, `"*.txt" = "echo hello"\n`);
    const r = await runTOE({ tool_name: "Edit", tool_input: { file_path: file } });
    expect(r.exit).toBe(0);
  });

  test("malformed TOML → exit 0 graceful", async () => {
    const file = join(TMP, "any.txt");
    await writeFile(file, "hi\n");
    await writeFile(CFG_PATH, `this is = = not toml ===\n[[`);
    const r = await runTOE({ tool_name: "Edit", tool_input: { file_path: file } });
    expect(r.exit).toBe(0);
  });

  test("glob mismatch → exit 0 no spawn", async () => {
    const file = join(TMP, "thing.md");
    await writeFile(file, "hi\n");
    await writeFile(CFG_PATH, `"*.py" = "echo hello"\n`);
    const r = await runTOE({ tool_name: "Edit", tool_input: { file_path: file } });
    expect(r.exit).toBe(0);
  });

  test("missing file_path → exit 0 no-op", async () => {
    await writeFile(CFG_PATH, `"*.txt" = "echo hi"\n`);
    const r = await runTOE({ tool_name: "Edit", tool_input: {} });
    expect(r.exit).toBe(0);
  });
});
