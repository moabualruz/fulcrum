import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const repoRoot = new URL("../../", import.meta.url).pathname;
const children: Bun.Subprocess[] = [];
let scratchHome = "";

beforeEach(() => {
  scratchHome = mkdtempSync(join(tmpdir(), "fulcrum-app-dev-startup-"));
});

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill();
  }
  if (scratchHome) {
    rmSync(scratchHome, { recursive: true, force: true });
    scratchHome = "";
  }
});

describe("app dev startup commands", () => {
  test("server dev command keeps running instead of crashing during TypeORM decorator setup", async () => {
    const result = await expectDevCommandToStayAlive(["run", "--cwd", "apps/server", "dev"], {
      FULCRUM_SERVER_PORT: "3199",
    });

    expect(result).toEqual({ stayedAlive: true });
  });

  test("tui dev command reports non-interactive terminals instead of silently exiting", async () => {
    const result = await runDevCommand(["run", "--cwd", "apps/tui", "dev"]);

    expect(result.code).toBe(0);
    expect(result.output).toContain("fulcrum tui: no interactive terminal detected");
  });
});

async function expectDevCommandToStayAlive(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stayedAlive: true } | { stayedAlive: false; output: string }> {
  const child = Bun.spawn(["bun", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
      FULCRUM_HOME: scratchHome,
      FULCRUM_FEATURES: "public-api,import-csv,export-csv,real-time-collab-server",
      NODE_ENV: "test",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  children.push(child);

  const output = collectOutput(child);
  const exit = await Promise.race([
    child.exited.then((code) => ({ code })),
    Bun.sleep(2_000).then(() => null),
  ]);

  if (exit === null) {
    child.kill();
    return { stayedAlive: true };
  }

  return {
    stayedAlive: false,
    output: await output,
  };
}

async function runDevCommand(args: string[]): Promise<{ code: number; output: string }> {
  const child = Bun.spawn(["bun", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      FULCRUM_HOME: scratchHome,
      FULCRUM_FEATURES: "public-api,import-csv,export-csv,real-time-collab-server",
      NODE_ENV: "test",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    code: await child.exited,
    output: await collectOutput(child),
  };
}

async function collectOutput(child: Bun.Subprocess): Promise<string> {
  const stdoutStream = child.stdout instanceof ReadableStream ? child.stdout : null;
  const stderrStream = child.stderr instanceof ReadableStream ? child.stderr : null;
  const [stdout, stderr] = await Promise.all([
    new Response(stdoutStream).text(),
    new Response(stderrStream).text(),
  ]);
  return `${stdout}\n${stderr}`.trim();
}
