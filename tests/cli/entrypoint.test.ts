import { beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const BINARY = join(process.cwd(), "dist", "fulcrum");

async function buildBinary(): Promise<void> {
  await mkdir(dirname(BINARY), { recursive: true });
  const proc = Bun.spawn(
    ["bun", "build", "--compile", "src/index.ts", "--outfile", BINARY],
    {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  expect(exitCode, stderr).toBe(0);
}

async function runFulcrum(args: readonly string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn([BINARY, ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe("fulcrum binary entrypoint", () => {
  beforeAll(async () => {
    await buildBinary();
  });

  test("--help exits 0 and lists top-level subcommands", async () => {
    const result = await runFulcrum(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("db");
    expect(result.stdout).toContain("web");
    expect(result.stdout).toContain("tui");
    expect(result.stdout).toContain("inference");
  });

  test("no args prints help and exits 0", async () => {
    const result = await runFulcrum([]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage:");
  });

  test("tui exits 0 (non-interactive mode graceful)", async () => {
    // When run outside a TTY (e.g. in CI / subprocess), the TUI detects the
    // missing terminal and exits cleanly with an informational message.
    const result = await runFulcrum(["tui"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    // Non-TTY environment: TUI prints a graceful no-TTY message and exits.
    expect(result.stdout).toContain("no interactive terminal detected");
  });

  test("inference help exits 0 and lists lifecycle verbs", async () => {
    const result = await runFulcrum(["inference", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("start");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("stop");
  });

  test("flags help is dispatched by the top-level binary", async () => {
    const result = await runFulcrum(["flags", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("fulcrum flags");
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("set");
  });
});
