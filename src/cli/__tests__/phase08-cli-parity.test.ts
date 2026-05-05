import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { listMissingCliDomains } from "../../surfaces/parity.ts";

function extractCaseLabels(source: string): string[] {
  return [...source.matchAll(/case\s+["']([^"']+)["']\s*:/g)].map((match) => match[1] ?? "");
}

describe("Phase 08 CLI parity inventory", () => {
  test("top-level CLI dispatch covers every required domain or compatibility wrapper", async () => {
    const [rootSource, productSource] = await Promise.all([
      readFile(new URL("../../index.ts", import.meta.url), "utf-8"),
      readFile(new URL("../index.ts", import.meta.url), "utf-8"),
    ]);
    const dispatchCases = [
      ...extractCaseLabels(rootSource),
      ...extractCaseLabels(productSource),
    ];

    expect(listMissingCliDomains(dispatchCases)).toEqual([]);
  });

  test("src/cli/index.ts has direct or delegated cases for Phase 08 command domains", async () => {
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
  const [, ...args] = command.split(" ");
  const proc = Bun.spawn(["bun", "src/index.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      FULCRUM_HOME: `${process.cwd()}/.scratch/phase08-cli-parity`,
      FULCRUM_PERMISSION_LOCAL_DEV_BYPASS: "true",
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("Phase 08 CLI JSON parity", () => {
  for (const command of JSON_COMMANDS) {
    test(`${command} emits parseable JSON`, async () => {
      const result = await runCli(command);
      expect(result.exitCode, result.stderr).toBe(0);

      const parsed = JSON.parse(result.stdout);
      expect(typeof parsed === "object").toBe(true);
    });
  }

  test("completion scripts are exposed for every supported shell", async () => {
    for (const shell of ["bash", "zsh", "fish", "powershell"]) {
      const command = `fulcrum completion --shell ${shell}`;
      const result = await runCli(command);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("fulcrum");
      expect(result.stdout.length).toBeGreaterThan(50);
    }
  });
});
