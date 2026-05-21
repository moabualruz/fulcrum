import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { run as runArtifact } from "../artifact.ts";
import { run as runConnectors } from "../connectors.ts";
import { run as runExport } from "../export.ts";
import { run as runImport } from "../import.ts";
import { run as runNotify } from "../notify.ts";
import { run as runProduct } from "../product.ts";
import { run as runSettings } from "../settings.ts";
import { run as runSprints } from "../sprints.ts";

type Runner = (argv: readonly string[], opts?: never) => Promise<void>;

const COMMANDS: Array<{
  name: string;
  run: Runner;
  help: string[];
  invalid: string[];
  caller: unknown;
}> = [
  {
    name: "import",
    run: runImport as Runner,
    help: ["csv", "--project", "--file", "--dry-run", "--json"],
    invalid: ["csv", "--bogus"],
    caller: { tasks: { bulkCreate: async () => ({ ok: true }) } },
  },
  {
    name: "export",
    run: runExport as Runner,
    help: ["tasks", "--project", "--format", "--output"],
    invalid: ["tasks", "--bogus"],
    caller: { tasks: { list: async () => [] } },
  },
  {
    name: "sprints",
    run: runSprints as Runner,
    help: ["add-task", "remove-task", "--sprint-id", "--task-id", "--json"],
    invalid: ["add-task", "--bogus"],
    caller: { sprints: { addTask: async () => ({}), removeTask: async () => ({}) } },
  },
  {
    name: "artifact",
    run: runArtifact as Runner,
    help: ["list", "show", "--json"],
    invalid: ["list", "--bogus"],
    caller: { artifacts: { list: async () => [], get: async () => ({ id: "a1" }) } },
  },
  {
    name: "connectors",
    run: runConnectors as Runner,
    help: ["list", "runs", "--json"],
    invalid: ["list", "--bogus"],
    caller: { connectors: { list: async () => [] } },
  },
  {
    name: "notify",
    run: runNotify as Runner,
    help: ["list", "mark-read", "rules", "channels", "--json"],
    invalid: ["list", "--bogus"],
    caller: { notify: { list: async () => [], markRead: async () => ({}), markAllRead: async () => ({}) } },
  },
  {
    name: "settings",
    run: runSettings as Runner,
    help: ["list", "get", "set", "--json"],
    invalid: ["list", "--bogus"],
    caller: { settings: { list: async () => [], get: async () => null, set: async () => ({}) } },
  },
  {
    name: "product",
    run: runProduct as Runner,
    help: ["projects", "tasks", "sprints", "search", "context", "--json"],
    invalid: ["projects", "list", "--bogus"],
    caller: { projects: { list: async () => [] } },
  },
];

describe("CLI command signature regression", () => {
  test.each(COMMANDS)("$name --help contains expected flags and subcommands", async ({ run, help }) => {
    const io = capture();
    await run(["--help"], io.opts as never);
    for (const expected of help) expect(io.out.join("\n")).toContain(expected);
    expect(io.exits).toEqual([]);
  });

  test.each(COMMANDS)("$name invalid flags exit 2", async ({ run, invalid, caller }) => {
    const io = capture();
    await run(invalid, { ...io.opts, caller } as never);
    expect(io.exits).toContain(2);
  });
});

describe("CLI-TUI-UX canonical bin dispatch contract", () => {
  function runBin(args: readonly string[], env: NodeJS.ProcessEnv = {}) {
    return spawnSync("bun", ["apps/cli/src/main.ts", ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
        FULCRUM_TRACE_ID: env["FULCRUM_TRACE_ID"] ?? "0123456789abcdef0123456789abcdef",
      },
    });
  }

  test("cli-signature sweep covers every CLI-TUI-UX.md command root", () => {
    const spec = readFileSync("CLI-TUI-UX.md", "utf8");
    const roots = [...new Set([
      ...spec
        .split(/\n/)
        .map((line) => line.match(/^fulcrum\s+([a-z][\w-]*)\b/)?.[1])
        .filter((root): root is string => Boolean(root)),
      "operate",
    ])].sort();

    expect(roots).toContain("trace");
    expect(roots).toContain("operate");
    expect(roots).toContain("plugin");
    expect(roots).toContain("repo");
    expect(roots).toContain("agent");

    for (const root of roots) {
      const args = root === "help" || root === "version" ? [root] : [root, "--help"];
      const result = spawnSync("bun", ["apps/cli/src/main.ts", ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      expect(output).not.toContain(`fulcrum: unknown command '${root}'`);
    }
  }, 20_000);

  test("trace show and operate plugin emit canonical envelopes through the actual bin", () => {
    const trace = runBin(["trace", "show", "4f3a1c9e", "--json"]);
    expect(trace.status).toBe(0);
    const traceEnvelope = JSON.parse(trace.stdout) as Record<string, unknown>;
    expect(traceEnvelope["schema"]).toBe("fulcrum.cli.v1");
    expect(traceEnvelope["command"]).toBe("trace show");

    const operate = runBin(["operate", "plugin", "list", "--json"]);
    expect(operate.status).toBe(0);
    const operateEnvelope = JSON.parse(operate.stdout) as Record<string, unknown>;
    expect(operateEnvelope["schema"]).toBe("fulcrum.cli.v1");
    expect(operateEnvelope["command"]).toBe("operate plugin list");
  });

  test.each([
    ["ship list", ["ship", "list"]],
    ["agent list", ["agent", "list"]],
    ["doctor", ["doctor"]],
    ["mcp list", ["mcp", "list"]],
    ["session list --no-spawn", ["session", "list", "--no-spawn"]],
  ] as Array<[string, string[]]>)("%s prints the default trace identity line in plain output", (_label, args) => {
    const proc = runBin(args);
    expect(proc.status).toBe(0);
    expect(proc.stdout).toContain("trace: 01234567");
  }, 20_000);

  test("session list --json --no-spawn emits a canonical envelope instead of aborting", () => {
    const proc = runBin(["session", "list", "--json", "--no-spawn"]);
    expect(proc.status).toBe(0);
    const parsed = JSON.parse(proc.stdout) as { schema: string; command: string; result: unknown; errors: unknown[] };
    expect(parsed.schema).toBe("fulcrum.cli.v1");
    expect(parsed.command).toBe("fulcrum session list");
    expect(Array.isArray(parsed.errors)).toBe(true);
  }, 20_000);

  test("root ai --thread preserves thread semantics in the result contract", () => {
    const proc = runBin(["ai", "--thread", "thread-9", "--json"]);
    expect(proc.status).toBe(0);
    const parsed = JSON.parse(proc.stdout) as {
      schema: string;
      args: { thread?: string; task?: string; step?: string };
      result: { threadId?: string; taskId?: string; stepScope?: string };
    };
    expect(parsed.schema).toBe("fulcrum.cli.v1");
    expect(parsed.args.thread).toBe("thread-9");
    expect(parsed.result.threadId).toBe("thread-9");
    expect(parsed.result.taskId).not.toBe("thread-9");
  }, 20_000);
});

/**
 * CLI-TUI-UX.md §1.6: `fulcrum operate plugin …` and the root alias
 * `fulcrum plugin …` must BOTH be reachable through the actual bin and BOTH
 * emit the canonical `fulcrum.cli.v1` envelope — never a raw array. This block
 * is the consumed-by proof for `prd-cli-operate-plugin-envelope-and-root-plugin`:
 * a parity check fails if the host exists but the bin does not dispatch it, or
 * if a live `--json` path falls back to a bare payload.
 */
describe("operate plugin envelope + root plugin alias", () => {
  function runBin(args: readonly string[]) {
    return spawnSync("bun", ["apps/cli/src/main.ts", ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
  }

  test("`operate plugin list --json` emits the canonical envelope, not a raw array", () => {
    const proc = runBin(["operate", "plugin", "list", "--json"]);
    expect(proc.status).toBe(0);
    const parsed = JSON.parse(proc.stdout) as Record<string, unknown>;
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed["schema"]).toBe("fulcrum.cli.v1");
    expect(parsed["command"]).toBe("operate plugin list");
    expect(Array.isArray(parsed["result"])).toBe(true);
    expect(Array.isArray(parsed["errors"])).toBe(true);
  }, 20_000);

  test("root `plugin list --json` is reachable and reports the root grammar", () => {
    const proc = runBin(["plugin", "list", "--json"]);
    expect(`${proc.stdout}\n${proc.stderr}`).not.toContain("unknown command 'plugin'");
    expect(proc.status).toBe(0);
    const parsed = JSON.parse(proc.stdout) as Record<string, unknown>;
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed["schema"]).toBe("fulcrum.cli.v1");
    expect(parsed["command"]).toBe("plugin list");
  }, 20_000);

  test("`operate plugin enable --agent codex --json` emits a coded error envelope", () => {
    const proc = runBin(["operate", "plugin", "enable", "caveman", "--agent", "codex", "--json"]);
    const envelope = JSON.parse(proc.stdout) as {
      schema: string;
      command: string;
      result: unknown;
      errors: Array<{ code: string }>;
    };
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("operate plugin enable");
    expect(envelope.result).toBeNull();
    expect(envelope.errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNAVAILABLE");
  }, 20_000);

  test("root `plugin enable --agent codex --json` emits the same coded error envelope", () => {
    const proc = runBin(["plugin", "enable", "caveman", "--agent", "codex", "--json"]);
    expect(`${proc.stdout}\n${proc.stderr}`).not.toContain("unknown command 'plugin'");
    const envelope = JSON.parse(proc.stdout) as {
      schema: string;
      command: string;
      errors: Array<{ code: string }>;
    };
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("plugin enable");
    expect(envelope.errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNAVAILABLE");
  }, 20_000);

  test.each([
    ["help capture --json-schema"],
    ["help agent --json-schema"],
    ["help route --json-schema"],
  ])("`fulcrum %s` prints result schema", (command) => {
    const proc = runBin(command.split(" "));
    expect(proc.status).toBe(0);
    const schema = JSON.parse(proc.stdout) as Record<string, unknown>;
    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["title"]).toBe("fulcrum.cli.v1");
    expect(JSON.stringify(schema)).toContain("trace_id");
    expect(JSON.stringify(schema)).toContain("result");
  });

  test.each([
    ["agent", ["add", "remove", "edit", "status", "defaults", "set-default"]],
    ["route", ["list", "set"]],
    ["report", ["list"]],
  ] as const)("`fulcrum %s --help` advertises canonical verbs", (root, verbs) => {
    const proc = runBin([root, "--help"]);
    expect(proc.status).toBe(0);
    for (const verb of verbs) expect(proc.stdout).toContain(verb);
  });

  test("root report command dispatches to explicit not-implemented envelope for list", () => {
    const proc = runBin(["report", "list", "--json"]);
    expect(proc.status).toBe(1);
    const envelope = JSON.parse(proc.stdout) as {
      schema: string;
      command: string;
      errors: Array<{ code: string }>;
    };
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("fulcrum report list");
    expect(envelope.errors[0]?.code).toBe("FUL_NOT_IMPLEMENTED");
  });
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}
