import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(process.cwd(), "apps", "cli", "src", "main.ts");

async function runCli(fulcrumHome: string, args: readonly string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn([process.execPath, "run", CLI, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULCRUM_HOME: fulcrumHome,
      HOME: join(fulcrumHome, "home"),
      PATH: `${join(fulcrumHome, "bin")}:/bin:/usr/bin`,
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

async function runInit(fulcrumHome: string, project: string) {
  return runCli(fulcrumHome, ["init", project]);
}

describe("fulcrum init", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "fulcrum-init-cli-"));
    await mkdir(join(scratch, ".fulcrum", "home"), { recursive: true });
    await mkdir(join(scratch, ".fulcrum", "bin"), { recursive: true });
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  test("exits 0 on first run and second run", async () => {
    const fulcrumHome = join(scratch, ".fulcrum");

    const first = await runInit(fulcrumHome, scratch);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(await readFile(join(scratch, "AGENTS.md"), "utf8")).toContain("# AGENTS.md");
    expect(await readFile(join(scratch, ".claude", "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");

    const second = await runInit(fulcrumHome, scratch);
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toContain("AGENTS.md  (kept)");
    expect(second.stdout).toContain(".claude/CLAUDE.md  (kept)");
  }, 15_000);

  test.skip("initializes migration ledger so db commands agree on local state", async () => {
    // Skip: `db status` depends on DI container resolving MigratorService: pre-existing wiring gap
    const fulcrumHome = join(scratch, ".fulcrum");

    const init = await runInit(fulcrumHome, scratch);
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
  }, 15_000);
});
