import { describe, expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listMissingCliDomains } from "@platform-core/application/interface-parity/surface-domain-matrix.ts";

function extractCaseLabels(source: string): string[] {
  return [...source.matchAll(/case\s+["']([^"']+)["']\s*:/g)].map((match) => match[1] ?? "");
}

describe("Surface CLI parity inventory", () => {
  test("top-level CLI dispatch covers every required domain or compatibility wrapper", async () => {
    const [rootSource, productSource] = await Promise.all([
      readFile(new URL("../main.ts", import.meta.url), "utf-8"),
      readFile(new URL("../index.ts", import.meta.url), "utf-8"),
    ]);
    const dispatchCases = [
      ...extractCaseLabels(rootSource),
      ...extractCaseLabels(productSource),
    ];

    expect(listMissingCliDomains(dispatchCases)).toEqual([]);
  });

  test("apps/cli/src/index.ts has direct or delegated cases for Surface command domains", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf-8");

    expect(source).toContain('case "tasks"');
    expect(source).toContain('case "docs"');
    expect(source).toContain('case "repos"');
    expect(source).toContain('case "runs"');
    expect(source).toContain('case "notify"');
  });
});

type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const JSON_COMMANDS = [
  "fulcrum tasks list --json",
  "fulcrum sprints list --json",
  "fulcrum docs list --json",
  "fulcrum memory list --json",
  "fulcrum runs list --json",
  "fulcrum repos list --json",
  "fulcrum artifacts list --json",
  "fulcrum search query test --json",
  "fulcrum notify list --json",
  "fulcrum routing rules list --json",
  "fulcrum inference status --json",
  "fulcrum components status --json",
  "fulcrum doctor --json",
] as const;

const COMMAND_MATRIX = [
  ["agents", "apps/cli/src/commands/agents.test.ts", "profile/test JSON", "unknown name exits non-zero"],
  ["artifacts", "apps/cli/src/agent-artifact.test.ts", "artifact list --json", "missing API config"],
  ["audit", "apps/cli/src/audit.test.ts", "query/export JSON", "missing format exits"],
  ["auth", "apps/cli/src/commands/auth.test.ts", "whoami JSON", "missing public API config"],
  ["backup", "apps/cli/src/backup.test.ts", "backup JSON formatter", "interactive non-output guard"],
  ["capture", "apps/cli/src/commands/capture.test.ts", "review/status JSON", "missing capture API"],
  ["comments", "apps/cli/src/commands/report.test.ts", "comment add", "unknown subcommand help"],
  ["components", "apps/cli/src/__tests__/cli-parity.test.ts", "components status --json", "root completion rejection"],
  ["connectors", "apps/cli/src/connectors.test.ts", "connectors list/runs JSON", "invalid flags"],
  ["data", "apps/cli/src/e2e/cli-signature-regression.test.ts", "import/export signatures", "invalid flags"],
  ["db", "apps/cli/src/commands/db.test.ts", "reset-local-state JSON", "confirmation gate"],
  ["docs", "apps/cli/src/docs-templates.test.ts", "docs template caller", "missing document API"],
  ["doctor", "apps/cli/src/commands/doctor.test.ts", "doctor caller boundary", "missing public API config"],
  ["errors", "apps/cli/src/api-errors.test.ts", "coded app errors", "unknown thrown values"],
  ["flags", "apps/cli/src/flags.test.ts", "flags list/get JSON", "unknown flag"],
  ["i18n", "tests/cli/root-dispatch-source.test.ts", "root help path", "cross-cutting invalid subcommand"],
  ["inference", "apps/cli/src/inference.test.ts", "status/start JSON", "unknown verb"],
  ["memory", "apps/cli/src/__tests__/cli-parity.test.ts", "memory list --json", "runtime auth boundary"],
  ["notify", "apps/cli/src/notify.test.ts", "notify list/rules JSON", "help and invalid paths"],
  ["offline", "apps/cli/src/__tests__/offline-reconnect.test.ts", "status/sync JSON", "unknown command"],
  ["product", "apps/cli/src/product.test.ts", "product workflow JSON", "invalid product arguments"],
  ["projects", "apps/cli/src/commands/projects.test.ts", "projects public API JSON", "missing public API config"],
  ["repos", "apps/cli/src/commands/repos.test.ts", "repos list/read/sync JSON", "auth boundary"],
  ["routing", "tests/cli/routing.test.ts", "rules list JSON", "invalid routing scope"],
  ["runs", "apps/cli/src/__tests__/cli-parity.test.ts", "runs list --json", "runtime auth boundary"],
  ["search", "apps/cli/src/commands/search-index.test.ts", "search index JSON", "limit validation"],
  ["settings", "apps/cli/src/settings.test.ts", "settings list/get/set JSON", "missing key"],
  ["skills", "apps/cli/src/commands/skills.test.ts", "skills lifecycle JSON", "missing slug/keep"],
  ["sprints", "apps/cli/src/sprints.test.ts", "sprints caller JSON", "missing public API config"],
  ["symphony", "apps/cli/src/symphony.test.ts", "symphony JSON flows", "unknown command groups"],
  ["tasks", "apps/cli/src/__tests__/task-quick-create.test.ts", "tasks new JSON", "empty title retry"],
  ["telemetry", "tests/cli/root-dispatch-source.test.ts", "root help path", "cross-cutting invalid subcommand"],
  ["theme", "tests/cli/root-dispatch-source.test.ts", "root help path", "cross-cutting invalid subcommand"],
  ["tui", "apps/cli/src/e2e/cli-signature-regression.test.ts", "tui help/no-tty", "non-interactive terminal guard"],
  ["webhooks", "tests/cli/runs-notify-audit-webhooks.test.ts", "webhook delivery JSON", "missing public API config"],
  ["work", "apps/cli/src/commands/project-work-suite.test.ts", "project work suite", "missing work item JSON"],
] as const;

describe("Surface CLI full command matrix", () => {
  test("every product command records help, success, bad-input, and runtime evidence", async () => {
    const missing = COMMAND_MATRIX.filter(([, evidence, success, badInput]) =>
      !evidence || !success || !badInput
    );
    const evidenceFiles = [...new Set(COMMAND_MATRIX.map(([, evidence]) => evidence))];

    expect(missing).toEqual([]);
    await Promise.all(evidenceFiles.map((evidence) => access(new URL(`../../../../${evidence}`, import.meta.url))));
    expect(COMMAND_MATRIX.map(([command]) => command).sort()).toEqual([...new Set(COMMAND_MATRIX.map(([command]) => command))].sort());
    expect(COMMAND_MATRIX.length).toBeGreaterThanOrEqual(35);
  });

  test("JSON smoke list stays represented in the full command matrix", () => {
    const matrixCommands = new Set<string>(COMMAND_MATRIX.map(([command]) => command));
    const missing = JSON_COMMANDS
      .map((command) => command.split(" ")[1]!)
      .filter((command) => !matrixCommands.has(command));

    expect(missing).toEqual([]);
  });
});

async function runCli(command: string): Promise<CliResult> {
  const home = await mkdtemp(join(tmpdir(), "fulcrum-surface-cli-"));
  const server = startJsonApiServer();
  try {
    if (!command.startsWith("fulcrum completion ")) {
      await runCliWithHome("fulcrum product init", home, server.url);
    }
    return await runCliWithHome(command, home, server.url);
  } finally {
    server.stop(true);
    await rm(home, { recursive: true, force: true });
  }
}

function startJsonApiServer(): { url: string; stop(force?: boolean): void } {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/v1/inference/health") {
        return Response.json({ status: "ok", backends: [] });
      }
      if (url.pathname === "/api/v1/inference/backends/probe") {
        return Response.json([]);
      }
      return Response.json([]);
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: (force?: boolean) => server.stop(force),
  };
}

async function runCliWithHome(command: string, home: string, serverUrl: string): Promise<CliResult> {
  const [, ...args] = command.split(" ");
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      FULCRUM_HOME: home,
      FULCRUM_FEATURES: "trpc-permission-local-dev-bypass",
      FULCRUM_SERVER_URL: serverUrl,
      FULCRUM_ORG_ID: "11111111-1111-4111-8111-111111111111",
      FULCRUM_USER_ID: "22222222-2222-4222-8222-222222222222",
      FULCRUM_API_TOKEN: "test-token",
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("Surface CLI JSON parity", () => {
  for (const command of JSON_COMMANDS) {
    test(`${command} emits parseable JSON`, async () => {
      const result = await runCli(command);
      expect(result.exitCode, result.stderr).toBe(0);

      const parsed = JSON.parse(result.stdout);
      expect(typeof parsed === "object").toBe(true);
    }, 60_000);
  }

  test("completion scripts are exposed for every supported shell", async () => {
    for (const shell of ["bash", "zsh", "fish", "powershell"]) {
      const command = `fulcrum completion --shell ${shell}`;
      const result = await runCli(command);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("fulcrum");
      expect(result.stdout.length).toBeGreaterThan(50);
    }
  }, 60_000);

  test("completion rejects unsupported shells", async () => {
    const result = await runCli("fulcrum completion --shell elvish");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("bash|zsh|fish|powershell");
  });
});
