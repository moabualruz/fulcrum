import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(process.cwd(), "src", "cli", "index.ts");

async function runInit(fulcrumHome: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(["bun", "run", CLI, "init"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULCRUM_HOME: fulcrumHome,
    },
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

describe("fulcrum init", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "fulcrum-init-cli-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  test("exits 0 on first run and second run", async () => {
    const fulcrumHome = join(scratch, ".fulcrum");

    const first = await runInit(fulcrumHome);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");

    const second = await runInit(fulcrumHome);
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toContain("Already initialized");
  });
});
