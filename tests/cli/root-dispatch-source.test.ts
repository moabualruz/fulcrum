import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DataSource } from "typeorm";
import { resolveClientAssetPath, run, buildDbContainer } from "../../apps/cli/src/index.ts";

const originalExit = process.exit;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;
const originalStdoutIsTTY = process.stdout.isTTY;
const originalStdinIsTTY = process.stdin.isTTY;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
let previousFulcrumHome: string | undefined;
const originalCwd = process.cwd();

async function captureRun(args: readonly string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;

  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: false,
  });
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: false,
  });
  process.exit = ((code?: string | number | null) => {
    exitCode = typeof code === "number" ? code : Number(code ?? 0);
    throw new Error(`process.exit(${exitCode})`);
  }) as typeof process.exit;
  console.log = (...args: unknown[]) => {
    stdout += `${args.map(String).join(" ")}\n`;
  };
  console.error = (...args: unknown[]) => {
    stderr += `${args.map(String).join(" ")}\n`;
  };

  try {
    await run(args);
  } catch (error) {
    if (!String((error as Error).message).startsWith("process.exit(")) {
      throw error;
    }
  }

  return { stdout, stderr, exitCode };
}

afterEach(() => {
  process.exit = originalExit;
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: originalStdoutIsTTY,
  });
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: originalStdinIsTTY,
  });
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  if (previousFulcrumHome === undefined) delete process.env.FULCRUM_HOME;
  else process.env.FULCRUM_HOME = previousFulcrumHome;
  process.chdir(originalCwd);
});

describe("root CLI source dispatch", () => {
  test("client asset path resolver accepts in-root assets and rejects escapes", () => {
    const root = "/tmp/fulcrum-client";

    expect(resolveClientAssetPath(root, "/assets/app.js")).toBe("/tmp/fulcrum-client/assets/app.js");
    expect(resolveClientAssetPath(root, "favicon.ico")).toBe("/tmp/fulcrum-client/favicon.ico");
    expect(resolveClientAssetPath(root, "/nested/%66ile.css")).toBe("/tmp/fulcrum-client/nested/file.css");
    expect(resolveClientAssetPath(root, "/../secret.txt")).toBeNull();
    expect(resolveClientAssetPath(root, "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveClientAssetPath(root, "/bad%00path")).toBeNull();
    expect(resolveClientAssetPath(root, "/%E0%A4%A")).toBeNull();
  });

  test("top-level help is served by apps/cli/src/index.ts", async () => {
    const result = await captureRun(["--help"]);

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("fulcrum");
    expect(result.stdout).toContain("work <create|inspect|move|link|report>");
    expect(result.stdout).toContain("inference <start|status|embed|generate|stop>");
  });

  test("init command bootstraps a real local database through the source router", async () => {
    previousFulcrumHome = process.env.FULCRUM_HOME;
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-cli-init-source-"));

    const first = await captureRun(["init"]);
    const second = await captureRun(["init"]);

    expect(first.exitCode).toBeNull();
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain("Local org bootstrapped");
    expect(second.exitCode).toBeNull();
    expect(second.stderr).toBe("");
    expect(second.stdout).toContain("Already initialized");
  });

  test("i18n command routes without DB and returns real normalized locale payloads", async () => {
    const list = await captureRun(["i18n", "list", "--json"]);
    const setArabic = await captureRun(["i18n", "set", "--locale", "ar", "--json"]);

    expect(list.exitCode).toBeNull();
    expect(JSON.parse(list.stdout)).toEqual({
      locales: ["en", "fr", "ar"],
      defaultLocale: "en",
    });
    expect(setArabic.exitCode).toBeNull();
    expect(JSON.parse(setArabic.stdout)).toEqual({ locale: "ar", dir: "rtl" });
  });

  test("db status --json uses the no-container path and reports temp local state", async () => {
    previousFulcrumHome = process.env.FULCRUM_HOME;
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-cli-db-source-"));

    const result = await captureRun(["db", "status", "--json"]);

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      backend: "pglite",
      current: null,
      pending: [],
      pastDue: 0,
      ok: true,
    });
  });

  test("buildDbContainer opens a real local ORM container and cleanup closes it", async () => {
    previousFulcrumHome = process.env.FULCRUM_HOME;
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-cli-db-container-"));

    const { container, cleanup } = await buildDbContainer();
    const ds = container.get(DataSource);

    const rows = await ds.query("SELECT 1 AS ok") as Array<{ ok: number }>;
    expect(rows).toEqual([{ ok: 1 }]);

    await cleanup();
    expect(ds.isInitialized).toBe(false);
  });

  test("web command validates the real build artifact before serving", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-cli-web-missing-build-"));
    previousFulcrumHome = process.env.FULCRUM_HOME;
    const fulcrumHome = join(scratch, "fulcrum-home");
    await mkdir(fulcrumHome, { recursive: true });
    process.env.FULCRUM_HOME = fulcrumHome;

    const { container, cleanup } = await buildDbContainer();
    try {
      await container.get(DataSource).runMigrations();
    } finally {
      await cleanup();
    }

    process.chdir(scratch);
    await expect(run(["web"])).rejects.toThrow(
      "web build missing. Run `bun --cwd apps/web run build` before `fulcrum web`.",
    );
  });

  test("web command rejects missing build before serving assets even on fresh DB", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "fulcrum-cli-web-pending-migrations-"));
    previousFulcrumHome = process.env.FULCRUM_HOME;
    const fulcrumHome = join(scratch, "fulcrum-home");
    await mkdir(fulcrumHome, { recursive: true });
    process.env.FULCRUM_HOME = fulcrumHome;
    process.chdir(scratch);

    // buildLocalApplicationContainer auto-runs migrations, so pending state
    // is never reached. The next gate — missing build artifacts — fires instead.
    await expect(run(["web"])).rejects.toThrow(
      "web build missing",
    );
  });

  test("unknown command exits 2 from the source router", async () => {
    const result = await captureRun(["wat"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("fulcrum: unknown command 'wat'");
  });

  test("data command exits 2 for unknown subcommands at the command boundary", async () => {
    previousFulcrumHome = process.env.FULCRUM_HOME;
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-cli-data-unknown-"));

    const result = await captureRun(["data", "bogus"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("fulcrum data: unknown command 'bogus'");
  });

  test.each([
    ["theme", ["theme", "bogus"], "fulcrum theme: unknown command 'bogus'"],
    ["telemetry", ["telemetry", "bogus"], "fulcrum telemetry: unknown command 'bogus'"],
    ["backup", ["backup", "bogus"], "fulcrum backup: missing required option --output"],
    ["errors", ["errors", "bogus"], "fulcrum errors: unknown command 'bogus'"],
    ["secrets", ["secrets", "bogus", "api-token"], "fulcrum secrets: unknown command 'bogus'"],
  ])("%s invalid subcommand validates at the command boundary", async (_name, args, message) => {
    previousFulcrumHome = process.env.FULCRUM_HOME;
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-cli-cross-cutting-"));

    const result = await captureRun(args);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(message);
  });

  test.each([
    ["projects", ["projects", "list", "--json"]],
    ["tasks", ["tasks", "list", "--json"]],
    ["work", ["work", "inspect", "missing-work-item", "--json"]],
    ["sprints", ["sprints", "list", "--json"]],
    ["routing", ["routing", "rules", "list", "--json"]],
    ["repos", ["repos", "list", "--json"]],
    ["docs", ["docs", "list", "--json"]],
    ["memory", ["memory", "list", "--json"]],
    ["search", ["search", "query", "project", "--json"]],
    ["artifacts", ["artifacts", "list", "--json"]],
    ["auth", ["auth", "whoami", "--json"]],
    ["symphony", ["symphony", "runs", "list", "--state", "ready", "--json"]],
    ["runs", ["runs", "list", "--json"]],
    ["notify", ["notify", "list", "--json"]],
    ["webhooks", ["webhooks", "list", "--json"]],
    ["settings", ["settings", "list", "--json"]],
  ])("%s non-help path reaches the command auth/config boundary", async (_name, args) => {
    previousFulcrumHome = process.env.FULCRUM_HOME;
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-cli-non-help-"));

    const result = await captureRun(args);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /UNAUTHORIZED|Authentication required|No active CLI session|API callers? (?:is|are) not configured|No procedure found on path|relation "tasks" does not exist/i,
    );
  });

  test.each([
    ["agents", ["agents", "--help"], "fulcrum agents"],
    ["projects", ["projects", "--help"], "fulcrum projects"],
    ["tasks", ["tasks", "--help"], "fulcrum tasks"],
    ["work", ["work", "--help"], "fulcrum work"],
    ["sprints", ["sprints", "--help"], "fulcrum sprints"],
    ["auth", ["auth", "--help"], "fulcrum auth"],
    ["auth login", ["auth", "login", "--non-interactive"], "not yet implemented"],
    ["auth logout", ["auth", "logout"], "not yet implemented"],
    ["flags", ["flags", "--help"], "fulcrum flags"],
    ["routing", ["routing", "--help"], "fulcrum routing"],
    ["repos", ["repos", "--help"], "fulcrum repos"],
    ["docs", ["docs", "--help"], "fulcrum docs"],
    ["memory", ["memory", "--help"], "fulcrum memory"],
    ["search", ["search", "--help"], "fulcrum search"],
    ["artifacts", ["artifacts", "--help"], "fulcrum artifacts"],
    ["symphony", ["symphony", "--help"], "fulcrum symphony"],
    ["runs", ["runs", "--help"], "fulcrum runs"],
    ["notify", ["notify", "--help"], "fulcrum notify"],
    ["audit", ["audit", "--help"], "fulcrum audit"],
    ["webhooks", ["webhooks", "--help"], "fulcrum webhooks"],
    ["connectors", ["connectors", "--help"], "fulcrum connectors"],
    ["settings", ["settings", "--help"], "fulcrum settings"],
    ["i18n", ["i18n", "--help"], "fulcrum i18n"],
    ["theme", ["theme", "--help"], "fulcrum theme"],
    ["telemetry", ["telemetry", "--help"], "fulcrum telemetry"],
    ["backup", ["backup", "--help"], "fulcrum backup"],
    ["data export help", ["data", "export", "--help"], "fulcrum export"],
    ["data import help", ["data", "import", "--help"], "fulcrum data import"],
    ["secrets", ["secrets", "--help"], "fulcrum secrets"],
    ["secrets init-keyring", ["secrets", "init-keyring", "--help"], "fulcrum secrets init-keyring"],
    ["errors", ["errors", "--help"], "fulcrum errors"],
    ["components", ["components", "--help"], "fulcrum component"],
    ["component alias", ["component", "--help"], "fulcrum component"],
    ["completion", ["completion", "--shell", "bash"], "complete -F"],
    ["tui", ["tui", "--help"], "fulcrum tui"],
    ["tui no tty", ["tui"], "no interactive terminal detected"],
    ["inference", ["inference", "--help"], "fulcrum inference"],
  ])("%s help path dispatches without opening DB", async (_name, args, expected) => {
    const result = await captureRun(args);

    expect(`${result.stdout}\n${result.stderr}`).toContain(expected);
  });

});
