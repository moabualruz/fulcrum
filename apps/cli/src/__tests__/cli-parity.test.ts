import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

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

async function runCli(command: string): Promise<CliResult> {
  const home = await mkdtemp(join(tmpdir(), "fulcrum-surface-cli-"));
  try {
    if (!command.startsWith("fulcrum completion ")) {
      await runCliWithHome("fulcrum init", home);
    }
    return await runCliWithHome(command, home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function runCliWithHome(command: string, home: string): Promise<CliResult> {
  const [, ...args] = command.split(" ");
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      FULCRUM_HOME: home,
      FULCRUM_FEATURES: "trpc-permission-local-dev-bypass",
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
    }, 20_000);
  }

  test("completion scripts are exposed for every supported shell", async () => {
    for (const shell of ["bash", "zsh", "fish", "powershell"]) {
      const command = `fulcrum completion --shell ${shell}`;
      const result = await runCli(command);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("fulcrum");
      expect(result.stdout.length).toBeGreaterThan(50);
    }
  }, 20_000);

  test("completion rejects unsupported shells", async () => {
    const result = await runCli("fulcrum completion --shell elvish");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("bash|zsh|fish|powershell");
  });
});
