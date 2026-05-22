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
      { args: ["agent", "enable", "codex", "--json"], command: "fulcrum agent enable" },
      { args: ["agent", "disable", "codex", "--json"], command: "fulcrum agent disable" },
      { args: ["agent", "reload", "codex", "--json"], command: "fulcrum agent reload" },
      { args: ["agent", "invoke", "codex", "--step", "step-1", "--json"], command: "fulcrum agent invoke" },
    ];

    for (const entry of cases) {
      const run = await runCli(entry.args);
      const envelope = parseEnvelope(run);
      expect(envelope["command"]).toBe(entry.command);
      expect(run.stderr.trim()).toBe("");
    }
  });

  test("AI Assist advertised lifecycle verbs run real success envelopes", async () => {
    const cases: ReadonlyArray<{ args: readonly string[]; command: string; result: Record<string, unknown> }> = [
      {
        args: ["ai", "send", "--thread", "thread-1", "--message", "hi", "--json"],
        command: "fulcrum ai send",
        result: { action: "send", threadId: "thread-1", message: "hi", status: "queued" },
      },
      {
        args: ["ai", "attach", "thread-1", "--json"],
        command: "fulcrum ai attach",
        result: { action: "attach", threadId: "thread-1", status: "attached" },
      },
      {
        args: ["ai", "pause", "thread-1", "--json"],
        command: "fulcrum ai pause",
        result: { action: "pause", threadId: "thread-1", status: "paused" },
      },
      {
        args: ["ai", "resume", "thread-1", "--json"],
        command: "fulcrum ai resume",
        result: { action: "resume", threadId: "thread-1", status: "active" },
      },
      {
        args: ["ai", "checkpoint", "thread-1", "--json"],
        command: "fulcrum ai checkpoint",
        result: { action: "checkpoint", threadId: "thread-1", checkpointId: "checkpoint-thread-1" },
      },
      {
        args: ["ai", "restore", "thread-1", "--checkpoint", "cp1", "--json"],
        command: "fulcrum ai restore",
        result: { action: "restore", threadId: "thread-1", checkpointId: "cp1", status: "restored" },
      },
      {
        args: ["ai", "prompt", "edit", "thread-1", "--message", "revise prompt", "--json"],
        command: "fulcrum ai prompt edit",
        result: { action: "prompt.edit", threadId: "thread-1", prompt: "revise prompt" },
      },
      {
        args: ["ai", "rerun", "thread-1", "--json"],
        command: "fulcrum ai rerun",
        result: { action: "rerun", threadId: "thread-1", status: "queued" },
      },
      {
        args: ["ai", "preview", "--task", "t1", "--json"],
        command: "fulcrum ai preview",
        result: { action: "preview", taskId: "t1", status: "ready" },
      },
      {
        args: ["ai", "route", "thread-1", "--agent", "codex", "--json"],
        command: "fulcrum ai route",
        result: { action: "route", threadId: "thread-1", agent: "codex" },
      },
    ];

    for (const entry of cases) {
      const run = await runCli(entry.args);
      expect(run.exitCode, run.stderr).toBe(0);
      expect(run.stderr.trim()).toBe("");
      const envelope = parseEnvelope(run);
      expect(envelope["command"]).toBe(entry.command);
      expect(envelope["errors"]).toEqual([]);
      expect(envelope["result"]).toMatchObject(entry.result);
      expect(JSON.stringify(envelope)).not.toContain("FUL_NOT_IMPLEMENTED");
    }
  });

  test("AI Assist unknown --json failures stay inside the canonical envelope", async () => {
    const run = await runCli(["ai", "unknown-verb", "--json"]);
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr.trim()).toBe("");
    const envelope = parseEnvelope(run);
    expect(envelope["command"]).toBe("fulcrum ai unknown-verb");
    expect((envelope["errors"] as Array<{ code: string }>)[0]?.code).toBe("FUL_CLI_UNKNOWN_COMMAND");
  });

  test("Operate MCP test/reload verbs run through the canonical envelope", async () => {
    await runCli(["mcp", "register", "closure8", "--http", "https://example.com/mcp", "--vendor", "test", "--agent", "codex"]);

    const testRun = await runCli(["mcp", "test", "closure8", "--agent", "codex", "--json"]);
    expect(testRun.exitCode, testRun.stderr).toBe(0);
    const testEnvelope = parseEnvelope(testRun);
    expect(testEnvelope["command"]).toBe("fulcrum mcp test");
    expect(testEnvelope["errors"]).toEqual([]);
    expect(testEnvelope["result"]).toMatchObject({ name: "closure8", agent: "codex", status: "configured" });

    const reloadRun = await runCli(["mcp", "reload", "closure8", "--agent", "codex", "--json"]);
    expect(reloadRun.exitCode, reloadRun.stderr).toBe(0);
    const reloadEnvelope = parseEnvelope(reloadRun);
    expect(reloadEnvelope["command"]).toBe("fulcrum mcp reload");
    expect(reloadEnvelope["errors"]).toEqual([]);
    expect(reloadEnvelope["result"]).toMatchObject({ name: "closure8", reloaded: true, agents: ["codex"] });
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

  test("help json schemas expose command-specific result payload properties", async () => {
    const cases: ReadonlyArray<{ command: string; properties: readonly string[] }> = [
      { command: "capture", properties: ["items", "summary"] },
      { command: "doctor", properties: ["bun", "platform", "agents", "warnings", "errors", "verdict"] },
      { command: "ship", properties: ["stage", "surface", "channels", "message"] },
      { command: "agent", properties: ["profiles"] },
      { command: "ai send", properties: ["action", "threadId", "message", "status"] },
      { command: "runs feed", properties: ["runs", "filters", "watch", "stream", "sentinel"] },
    ];

    for (const entry of cases) {
      const schemaRun = await runCli(["help", ...entry.command.split(" "), "--json-schema"]);
      expect(schemaRun.exitCode, `${entry.command}\n${schemaRun.stderr}`).toBe(0);
      const schema = JSON.parse(schemaRun.stdout) as {
        properties?: { result?: { oneOf?: unknown; properties?: Record<string, unknown>; required?: string[] } };
      };
      const result = schema.properties?.result;
      expect(result?.oneOf, entry.command).toBeUndefined();
      for (const property of entry.properties) {
        expect(result?.properties, entry.command).toHaveProperty(property);
      }
      expect(result?.required, entry.command).toEqual(expect.arrayContaining(entry.properties));
    }
  });
});
