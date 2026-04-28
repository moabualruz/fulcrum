// Tests for the format hook — fail-open auto-formatter dispatch.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let TMP: string;
let SLIM_PATH: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-format-"));
  const emptyBin = join(TMP, "empty-bin");
  await mkdir(emptyBin, { recursive: true });
  // Slim PATH: empty dir + just enough to find `bun` itself (and `sh` for which()).
  // Resolve bun's directory from process.execPath so the test inherits the runner.
  const bunDir = process.execPath.replace(/\/[^/]+$/, "");
  SLIM_PATH = `${emptyBin}:${bunDir}:/usr/bin:/bin`;
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function runFormat(envelope: object, env: Record<string, string> = {}): Promise<{ stdout: string; exit: number; stderr: string }> {
  const json = JSON.stringify(envelope);
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, json);
  const processEnv = { ...process.env, HOME: TMP, ...env } as Record<string, string>;
  delete processEnv["FULCRUM_DEBUG"];
  const proc = Bun.spawn(["bun", "src/index.ts", "hook", "format"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    env: processEnv,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, exit, stderr };
}

describe("format", () => {
  test(".py file with no formatter on PATH → exit 0 silently (fail-open)", async () => {
    const file = join(TMP, "sample.py");
    await writeFile(file, "x=1\n");
    const r = await runFormat(
      { tool_name: "Edit", tool_input: { file_path: file } },
      { PATH: SLIM_PATH },
    );
    expect(r.exit).toBe(0);
  });

  test("non-matching extension (.xyz) → exit 0, no-op", async () => {
    const file = join(TMP, "thing.xyz");
    await writeFile(file, "irrelevant\n");
    const r = await runFormat({ tool_name: "Edit", tool_input: { file_path: file } });
    expect(r.exit).toBe(0);
  });

  test("missing file_path → exit 0 no-op", async () => {
    const r = await runFormat({ tool_name: "Edit", tool_input: {} });
    expect(r.exit).toBe(0);
  });

  test("file_path that doesn't exist on disk → exit 0 no-op", async () => {
    const r = await runFormat({
      tool_name: "Edit",
      tool_input: { file_path: join(TMP, "does-not-exist.py") },
    });
    expect(r.exit).toBe(0);
  });

  test("invalid JSON envelope → exit 0 + one-liner to stderr (fail-open)", async () => {
    const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    await Bun.write(stdinFile, "{ invalid json }");
    const processEnv = { ...process.env, HOME: TMP } as Record<string, string>;
    delete processEnv["FULCRUM_DEBUG"];
    const proc = Bun.spawn(["bun", "src/index.ts", "hook", "format"], {
      stdin: Bun.file(stdinFile),
      stdout: "pipe",
      stderr: "pipe",
      env: processEnv,
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exit = await proc.exited;

    expect(exit).toBe(0);
    expect(stdout).toBe(""); // no output to stdout
    // Check for the one-liner in stderr (unconditional on envelope parse failure)
    expect(stderr).toContain("fulcrum hook format: envelope parse failed (invalid JSON):");
    expect(stderr).toContain("invalid json");
  });

  test("empty stdin → exit 0, no stderr output (fail-open)", async () => {
    const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    await Bun.write(stdinFile, "");
    const processEnv = { ...process.env, HOME: TMP } as Record<string, string>;
    delete processEnv["FULCRUM_DEBUG"];
    const proc = Bun.spawn(["bun", "src/index.ts", "hook", "format"], {
      stdin: Bun.file(stdinFile),
      stdout: "pipe",
      stderr: "pipe",
      env: processEnv,
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exit = await proc.exited;

    expect(exit).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe(""); // empty stdin is silent no-op (not an error)
  });
});
