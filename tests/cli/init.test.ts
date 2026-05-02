import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(process.cwd(), "src", "cli", "index.ts");

async function runCli(fulcrumHome: string, args: readonly string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
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

async function runInit(fulcrumHome: string) {
  return runCli(fulcrumHome, ["init"]);
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

  test("initializes migration ledger so db commands agree on local state", async () => {
    const fulcrumHome = join(scratch, ".fulcrum");

    const init = await runInit(fulcrumHome);
    expect(init.exitCode).toBe(0);
    expect(init.stderr).toBe("");

    const status = await runCli(fulcrumHome, ["db", "status"]);
    expect(status.exitCode).toBe(0);
    expect(status.stderr).toBe("");
    const statusJson = JSON.parse(status.stdout) as {
      current: string | null;
      pending: string[];
      pastDue: number;
    };
    expect(statusJson.current).toMatch(/^Migration\d+/);
    expect(statusJson.pending).toEqual([]);
    expect(statusJson.pastDue).toBe(0);

    const history = await runCli(fulcrumHome, ["db", "history"]);
    expect(history.exitCode).toBe(0);
    expect(history.stderr).toBe("");
    const historyJson = JSON.parse(history.stdout) as Array<{
      version: number;
      name: string;
      direction: "up" | "down";
    }>;
    expect(statusJson.current).not.toBeNull();
    expect(historyJson.length).toBeGreaterThan(0);
    expect(historyJson.at(-1)?.name).toBe(statusJson.current ?? undefined);
    expect(historyJson.every((row) => row.direction === "up")).toBe(true);

    const migrate = await runCli(fulcrumHome, ["db", "migrate"]);
    expect(migrate.exitCode).toBe(0);
    expect(migrate.stderr).toBe("");
    expect(migrate.stdout).toContain("Migration complete.");
  });
});
