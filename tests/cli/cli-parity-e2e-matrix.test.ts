import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ROOT_HELP, STAGE_HELP_TOPICS, renderStageHelp } from "../../apps/cli/src/help.ts";
import { isCanonicalEnvelope } from "../../apps/cli/src/lib/envelope.ts";

type RunResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

type MatrixCommand = {
  readonly name: string;
  readonly args: readonly string[];
  readonly plainArgs?: readonly string[];
};

const CANONICAL_KEYS = [
  "args",
  "command",
  "duration_ms",
  "errors",
  "next_actions",
  "project_id",
  "result",
  "run_id",
  "schema",
  "span_id",
  "timestamp",
  "trace_id",
] as const;

const LIVE_JSON_MATRIX: MatrixCommand[] = [
  { name: "version", args: ["--version", "--json"] },
  { name: "doctor", args: ["doctor", "--json"] },
  { name: "mcp list", args: ["mcp", "list", "--json"] },
  { name: "session list", args: ["session", "list", "--no-spawn", "--json"] },
  { name: "trace show", args: ["trace", "show", "01234567", "--json"], plainArgs: ["trace", "show", "01234567"] },
];

function extractHelpCommands(help: string): string[] {
  return [...help.matchAll(/^\s{2}(fulcrum\s+[^\n]+)/gm)]
    .map((match) => match[1]!.replace(/\s{2,}.*/, "").trim())
    .filter((line) => !line.includes("help <stage>"))
    .sort();
}

function extractJsonHelpCommands(help: string): string[] {
  return extractHelpCommands(help).filter((line) => line.includes("--json"));
}

function expectedRootCommands(): string[] {
  return [
    ...new Set(
      extractHelpCommands(ROOT_HELP)
        .map((line) => line.match(/^fulcrum\s+([^\s|<[]+)/)?.[1])
        .filter((root): root is string => Boolean(root)),
    ),
  ].sort();
}

async function runFulcrum(args: readonly string[]): Promise<RunResult> {
  const home = await mkdtemp(join(tmpdir(), "fulcrum-cli-parity-"));
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", ...args], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: {
      ...process.env,
      FULCRUM_HOME: home,
      FULCRUM_TRACE_ID: "0123456789abcdef0123456789abcdef",
      FULCRUM_PROJECT_ID: "project-cli-parity",
      FULCRUM_COMMIT: "test-commit",
      FULCRUM_BUILD_DATE: "2026-05-21T00:00:00Z",
      NO_COLOR: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function parseEnvelope(stdout: string): Record<string, unknown> {
  const firstLine = stdout.trim().split(/\n/)[0] ?? "";
  return JSON.parse(firstLine) as Record<string, unknown>;
}

describe("generated CLI parity e2e matrix", () => {
  test("matrix is generated from root/stage help and covers live --json parity regressions", () => {
    const rootCommands = expectedRootCommands();
    const stageHelp = STAGE_HELP_TOPICS.map((topic) => renderStageHelp(topic) ?? "").join("\n");
    const advertisedJsonCommands = extractJsonHelpCommands(`${ROOT_HELP}\n${stageHelp}`);
    const matrixNames = LIVE_JSON_MATRIX.map((entry) => entry.name);

    for (const root of ["doctor", "mcp", "session"]) {
      expect(rootCommands).toContain(root);
    }
    for (const command of [
      "fulcrum doctor [--json] [--subsystem <name>] [--checks] [--probe]",
      "fulcrum session list --json",
    ]) {
      expect(advertisedJsonCommands).toContain(command);
    }
    for (const name of ["doctor", "mcp list", "session list", "trace show"]) {
      expect(matrixNames).toContain(name);
    }
  });

  test.each(LIVE_JSON_MATRIX)("$name --json emits the canonical fulcrum.cli.v1 envelope", async ({ args }: MatrixCommand) => {
    const result = await runFulcrum(args);
    expect(result.exitCode, result.stderr).toBe(0);

    const envelope = parseEnvelope(result.stdout);
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(Object.keys(envelope).sort()).toEqual([...CANONICAL_KEYS]);
    expect(envelope["trace_id"]).toBe("0123456789abcdef0123456789abcdef");
    expect(envelope["project_id"]).toBe("project-cli-parity");
  }, 30_000);

  test.each(LIVE_JSON_MATRIX.filter((entry) => entry.plainArgs))(
    "$name plain output includes the trace line",
    async ({ plainArgs }: MatrixCommand) => {
      const result = await runFulcrum(plainArgs!);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("trace:");
      expect(result.stdout).toContain("project: project-cli-parity");
    },
    30_000,
  );
});
