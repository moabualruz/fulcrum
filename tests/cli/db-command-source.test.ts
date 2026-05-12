import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../../apps/cli/src/commands/db.ts";

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalExit = process.exit;
const originalFulcrumHome = process.env.FULCRUM_HOME;

async function captureDbRun(args: readonly string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;

  console.log = (...args: unknown[]) => {
    stdout += `${args.map(String).join(" ")}\n`;
  };
  console.error = (...args: unknown[]) => {
    stderr += `${args.map(String).join(" ")}\n`;
  };
  process.exit = ((code?: string | number | null) => {
    exitCode = typeof code === "number" ? code : Number(code ?? 0);
    throw new Error(`process.exit(${exitCode})`);
  }) as typeof process.exit;

  try {
    await run(args, null);
  } catch (error) {
    if (!String((error as Error).message).startsWith("process.exit(")) throw error;
  }

  return { stdout, stderr, exitCode };
}

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  process.exit = originalExit;
  if (originalFulcrumHome === undefined) delete process.env.FULCRUM_HOME;
  else process.env.FULCRUM_HOME = originalFulcrumHome;
});

describe("fulcrum db command source behavior", () => {
  test("status without a DB container reports the real default product database config as JSON", async () => {
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-db-status-"));

    const result = await captureDbRun(["status", "--json"]);

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      backend: "pglite",
      current: null,
      pending: [],
      pastDue: 0,
      ok: true,
    });
  });

  test("reset-local-state plans refusal and confirmation against the selected Fulcrum home", async () => {
    const fulcrumHome = await mkdtemp(join(tmpdir(), "fulcrum-db-reset-"));

    const refusal = await captureDbRun([
      "reset-local-state",
      "--fulcrum-home",
      fulcrumHome,
      "--json",
    ]);
    const confirmed = await captureDbRun([
      "reset-local-state",
      "--fulcrum-home",
      fulcrumHome,
      "--yes-reset-local-state",
      "--json",
    ]);

    expect(refusal.stderr).toBe("");
    expect(confirmed.stderr).toBe("");
    expect(JSON.parse(refusal.stdout)).toMatchObject({
      status: "reset-required",
      fulcrumHome,
      canExecute: false,
      requiredFlag: "--yes-reset-local-state",
    });
    expect(JSON.parse(confirmed.stdout)).toMatchObject({
      status: "reset-required",
      fulcrumHome,
      canExecute: true,
      requiredFlag: "--yes-reset-local-state",
    });
  });

  test("reset-local-state can read FULCRUM_HOME and prints human refusal text", async () => {
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-db-reset-env-"));

    const result = await captureDbRun(["reset-local-state"]);

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`Refusing to reset FULCRUM_HOME=${process.env.FULCRUM_HOME}`);
    expect(result.stdout).toContain("--yes-reset-local-state");
  });

  test("migrate rejects unsupported explicit product database backends before touching migrations", async () => {
    await expect(run(["migrate", "--backend", "sqlite"], null)).rejects.toThrow(
      "unsupported database backend: sqlite",
    );
  });

  test("unknown subcommands print help and exit 2", async () => {
    const result = await captureDbRun(["vacuum"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("fulcrum db: unknown command 'vacuum'");
    expect(result.stderr).toContain("fulcrum db migrate");
  });
});
