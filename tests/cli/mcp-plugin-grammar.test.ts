import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CliRun = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type JsonSchema = {
  title?: string;
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

type CliEnvelope = {
  schema: string;
  command: string;
  result: unknown;
  errors: Array<{ code: string; message: string; fix?: string }>;
  next_actions: unknown[];
};

async function withTempHome<T>(fn: (env: Record<string, string>) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "fulcrum-cli-grammar-"));
  try {
    return await fn({
      HOME: home,
      FULCRUM_HOME: home,
      FULCRUM_TRACE_ID: "0123456789abcdef0123456789abcdef",
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function runCli(args: readonly string[], env: Record<string, string> = {}): Promise<CliRun> {
  const proc = Bun.spawn([process.execPath, "run", "apps/cli/src/main.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function parseEnvelope(run: CliRun): CliEnvelope {
  expect(run.stdout.trim(), run.stderr).not.toBe("");
  const envelope = JSON.parse(run.stdout) as CliEnvelope;
  expect(envelope.schema).toBe("fulcrum.cli.v1");
  expect(Array.isArray(envelope.errors)).toBe(true);
  expect(Array.isArray(envelope.next_actions)).toBe(true);
  return envelope;
}

async function resultSchema(command: string): Promise<JsonSchema> {
  const run = await runCli(["help", ...command.split(" "), "--json-schema"]);
  expect(run.exitCode, `${command}\n${run.stderr}`).toBe(0);
  const schema = JSON.parse(run.stdout) as { properties?: { result?: JsonSchema } };
  const result = schema.properties?.result;
  expect(result, command).toBeDefined();
  expect(result?.title, command).toContain(`fulcrum ${command} result`);
  return result!;
}

function objectProperties(schema: JsonSchema): Record<string, JsonSchema> {
  if (schema.type === "array") return schema.items?.properties ?? {};
  return schema.properties ?? {};
}

function expectNotGenericFallback(command: string, schema: JsonSchema): void {
  const properties = Object.keys(objectProperties(schema)).sort();
  expect(properties, command).not.toEqual(["command", "items", "root", "summary", "value"]);
}

describe("CLI MCP/plugin envelope and schema grammar", () => {
  test("mcp test/reload missing-server --json errors stay inside the canonical envelope", async () => {
    await withTempHome(async (env) => {
      const cases = [
        { args: ["mcp", "test", "definitely-missing", "--agent", "codex", "--json"], command: "fulcrum mcp test" },
        { args: ["mcp", "reload", "definitely-missing", "--agent", "codex", "--json"], command: "fulcrum mcp reload" },
      ] as const;

      for (const entry of cases) {
        const run = await runCli(entry.args, env);
        expect(run.exitCode, entry.args.join(" ")).toBe(2);
        expect(run.stderr.trim(), entry.args.join(" ")).toBe("");
        const envelope = parseEnvelope(run);
        expect(envelope.command).toBe(entry.command);
        expect(envelope.result).toBeNull();
        expect(envelope.errors[0]?.code).toBe("FUL_MCP_SERVER_NOT_FOUND");
        expect(envelope.errors[0]?.message).toContain("definitely-missing");
      }
    });
  });

  test("plugin mutation verbs are honestly deferred and return non-zero JSON error envelopes", async () => {
    await withTempHome(async (env) => {
      const run = await runCli(["plugin", "enable", "demo", "--agent", "codex", "--json"], env);
      expect(run.exitCode).toBe(1);
      expect(run.stderr.trim()).toBe("");
      const envelope = parseEnvelope(run);
      expect(envelope.command).toBe("fulcrum plugin enable");
      expect(envelope.result).toBeNull();
      expect(envelope.errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNAVAILABLE");
      expect(envelope.errors[0]?.fix).toContain("plugins.cross_agent");

      const rootHelp = await runCli(["--help"], env);
      expect(rootHelp.stdout).toContain("deferred");

      const operateHelp = await runCli(["help", "operate"], env);
      expect(operateHelp.stdout).toContain("deferred");

      const pluginHelp = await runCli(["plugin", "help"], env);
      expect(pluginHelp.stdout).toContain("deferred");
    });
  });

  test("agent, MCP, and plugin json schemas are command-specific and match live result shapes", async () => {
    await withTempHome(async (env) => {
      const register = await runCli([
        "mcp",
        "register",
        "deepwiki",
        "--http",
        "https://example.com/mcp",
        "--vendor",
        "deepwiki",
        "--agent",
        "codex",
      ], env);
      expect(register.exitCode, register.stderr).toBe(0);

      const liveCases = [
        {
          command: "agent invoke",
          run: await runCli(["agent", "invoke", "codex", "--step", "step-review", "--json"], env),
          properties: ["action", "agent", "profile", "stepId", "policy", "status"],
        },
        {
          command: "mcp list",
          run: await runCli(["mcp", "list", "--json"], env),
          properties: ["name", "transport", "vendor", "default_enabled", "agent_state", "disabled_config"],
          array: true,
        },
        {
          command: "mcp test",
          run: await runCli(["mcp", "test", "deepwiki", "--agent", "codex", "--json"], env),
          properties: ["name", "transport", "vendor", "status", "agent", "agents", "checks", "testedAt"],
        },
        {
          command: "mcp reload",
          run: await runCli(["mcp", "reload", "deepwiki", "--agent", "codex", "--json"], env),
          properties: ["name", "reloaded", "agents", "messages"],
        },
        {
          command: "plugin list",
          run: await runCli(["plugin", "list", "--json"], env),
          properties: ["id", "name", "enabled", "source", "marker"],
          array: true,
        },
      ] as const;

      for (const entry of liveCases) {
        expect(entry.run.exitCode, `${entry.command}\n${entry.run.stderr}`).toBe(0);
        const envelope = parseEnvelope(entry.run);
        expect(envelope.command).toBe(`fulcrum ${entry.command}`);
        const schema = await resultSchema(entry.command);
        expectNotGenericFallback(entry.command, schema);
        if ("array" in entry && entry.array) expect(schema.type, entry.command).toBe("array");
        const properties = objectProperties(schema);
        for (const property of entry.properties) {
          expect(properties, entry.command).toHaveProperty(property);
        }
      }

      const advertisedCommands = [
        "agent list",
        "agent view",
        "agent add",
        "agent edit",
        "agent remove",
        "agent enable",
        "agent disable",
        "agent set-default",
        "agent reload",
        "agent invoke",
        "agent test",
        "mcp list",
        "mcp register",
        "mcp unregister",
        "mcp enable",
        "mcp disable",
        "mcp test",
        "mcp reload",
        "plugin list",
        "plugin show",
        "plugin install",
        "plugin enable",
        "plugin disable",
        "plugin update",
        "plugin remove",
      ];

      for (const command of advertisedCommands) {
        const schema = await resultSchema(command);
        expectNotGenericFallback(command, schema);
      }

      for (const command of ["plugin install", "plugin enable", "plugin disable", "plugin update", "plugin remove"]) {
        const schema = await resultSchema(command);
        expect(schema.type, command).toBe("null");
      }
    });
  });
});
