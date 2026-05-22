import { describe, expect, test } from "bun:test";

type CliRun = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runCli(args: readonly string[]): Promise<CliRun> {
  const proc = Bun.spawn([
    process.execPath,
    "run",
    "apps/cli/src/main.ts",
    ...args,
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      FULCRUM_HOME: process.env["FULCRUM_HOME"] ?? "/tmp/fulcrum-canonical-root-contract",
      FULCRUM_TRACE_ID: "0123456789abcdef0123456789abcdef",
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function parseEnvelope(run: CliRun): Record<string, unknown> {
  expect(run.stdout.trim(), run.stderr).not.toBe("");
  const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
  expect(parsed["schema"]).toBe("fulcrum.cli.v1");
  expect(Array.isArray(parsed["errors"])).toBe(true);
  expect(Array.isArray(parsed["next_actions"])).toBe(true);
  return parsed;
}

function parseAdvertisedRoots(help: string): string[] {
  const roots = new Set<string>();
  for (const match of help.matchAll(/^\s+fulcrum\s+([a-zA-Z][a-zA-Z0-9|-]*)/gm)) {
    const token = match[1];
    if (!token) continue;
    for (const root of token.split("|")) {
      roots.add(root);
    }
  }
  return [...roots].sort();
}

function commandPathFromHelpLine(root: string): string[] {
  if (root === "help") return ["help"];
  return [root];
}

describe("canonical CLI root live contract", () => {
  test("reviewed canonical roots emit fulcrum.cli.v1 envelopes with the invoked command", async () => {
    const cases: ReadonlyArray<{ args: readonly string[]; command: string }> = [
      { args: ["note", "list", "--json"], command: "fulcrum note list" },
      { args: ["cycle", "list", "--json"], command: "fulcrum cycle list" },
      { args: ["module", "list", "--json"], command: "fulcrum module list" },
      { args: ["run", "view", "run-1", "--json"], command: "fulcrum run view" },
      { args: ["doc", "new", "--title", "T", "--json"], command: "fulcrum doc new" },
    ];

    for (const entry of cases) {
      const run = await runCli(entry.args);
      const envelope = parseEnvelope(run);
      expect(envelope["command"]).toBe(entry.command);
      expect(run.stderr.trim()).toBe("");
    }
  });

  test("AI Assist advertised verbs and unknown --json failures stay inside the canonical envelope", async () => {
    const cases: ReadonlyArray<{ args: readonly string[]; command: string; code: string }> = [
      {
        args: ["ai", "send", "--thread", "thread-1", "--message", "hi", "--json"],
        command: "fulcrum ai send",
        code: "FUL_NOT_IMPLEMENTED",
      },
      { args: ["ai", "attach", "thread-1", "--json"], command: "fulcrum ai attach", code: "FUL_NOT_IMPLEMENTED" },
      { args: ["ai", "pause", "thread-1", "--json"], command: "fulcrum ai pause", code: "FUL_NOT_IMPLEMENTED" },
      { args: ["ai", "resume", "thread-1", "--json"], command: "fulcrum ai resume", code: "FUL_NOT_IMPLEMENTED" },
      { args: ["ai", "checkpoint", "thread-1", "--json"], command: "fulcrum ai checkpoint", code: "FUL_NOT_IMPLEMENTED" },
      {
        args: ["ai", "restore", "thread-1", "--checkpoint", "cp1", "--json"],
        command: "fulcrum ai restore",
        code: "FUL_NOT_IMPLEMENTED",
      },
      { args: ["ai", "preview", "--task", "t1", "--json"], command: "fulcrum ai preview", code: "FUL_NOT_IMPLEMENTED" },
      { args: ["ai", "unknown-verb", "--json"], command: "fulcrum ai unknown-verb", code: "FUL_CLI_UNKNOWN_COMMAND" },
    ];

    for (const entry of cases) {
      const run = await runCli(entry.args);
      expect(run.exitCode).not.toBe(0);
      expect(run.stderr.trim()).toBe("");
      const envelope = parseEnvelope(run);
      expect(envelope["command"]).toBe(entry.command);
      expect((envelope["errors"] as Array<{ code: string }>)[0]?.code).toBe(entry.code);
    }
  });

  test("every advertised root has bin-level help and command-specific json schema", async () => {
    const help = await runCli(["--help"]);
    expect(help.exitCode, help.stderr).toBe(0);
    const roots = parseAdvertisedRoots(help.stdout);
    expect(roots).toContain("mcp");
    expect(roots).toContain("note");
    expect(roots).toContain("ai");

    for (const root of roots) {
      const rootHelp = await runCli([...commandPathFromHelpLine(root), "--help"]);
      expect(rootHelp.exitCode, `${root}\n${rootHelp.stderr}`).toBe(0);
      expect(rootHelp.stdout).toContain("fulcrum");

      const schemaRun = await runCli(["help", root, "--json-schema"]);
      expect(schemaRun.exitCode, `${root}\n${schemaRun.stderr}`).toBe(0);
      const schema = JSON.parse(schemaRun.stdout) as {
        title?: string;
        properties?: { result?: unknown };
      };
      expect(schema.title).toContain("fulcrum.cli.v1");
      expect(schema.properties?.result).not.toBe(true);
      expect(JSON.stringify(schema.properties?.result)).toContain(root);
    }
  }, 120_000);
});
