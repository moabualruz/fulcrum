// Tests for the lint-gate hook — fail-open lint dispatch.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let TMP: string;
let SLIM_PATH: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-lint-"));
  const emptyBin = join(TMP, "empty-bin");
  await mkdir(emptyBin, { recursive: true });
  const bunDir = process.execPath.replace(/\/[^/]+$/, "");
  SLIM_PATH = `${emptyBin}:${bunDir}:/usr/bin:/bin`;
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function runLint(envelope: object, env: Record<string, string> = {}): Promise<{ stdout: string; exit: number; stderr: string }> {
  const json = JSON.stringify(envelope);
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, json);
  const proc = Bun.spawn(["bun", "src/index.ts", "hook", "lint-gate"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: TMP, ...env },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, exit, stderr };
}

describe("lint-gate", () => {
  test(".py file when ruff not on PATH → exit 0 (fail-open)", async () => {
    const file = join(TMP, "x.py");
    await writeFile(file, "x = 1\n");
    const r = await runLint(
      { tool_name: "Edit", tool_input: { file_path: file } },
      { PATH: SLIM_PATH },
    );
    expect(r.exit).toBe(0);
  });

  test("non-matching extension → exit 0 no-op", async () => {
    const file = join(TMP, "thing.xyz");
    await writeFile(file, "irrelevant\n");
    const r = await runLint({ tool_name: "Edit", tool_input: { file_path: file } });
    expect(r.exit).toBe(0);
  });

  test("missing file_path → exit 0 no-op", async () => {
    const r = await runLint({ tool_name: "Edit", tool_input: {} });
    expect(r.exit).toBe(0);
  });

  test("non-existent file path → exit 0 no-op", async () => {
    const r = await runLint({
      tool_name: "Edit",
      tool_input: { file_path: join(TMP, "nope.py") },
    });
    expect(r.exit).toBe(0);
  });
});
