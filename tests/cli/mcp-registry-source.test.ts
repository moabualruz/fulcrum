import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  applyDisabledToAgents,
  applyToAgents,
  disabledConfigSupport,
  isEnabled,
  loadRegistry,
  registerServer,
  removeFromAgents,
  setEnabled,
  stripCodexMcpServerConfig,
  unregisterServer,
  type McpServerSpec,
} from "../../apps/cli/src/mcp-registry.ts";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-mcp-registry-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  await mkdir(join(process.env["HOME"], ".codex"), { recursive: true });
  await mkdir(join(process.env["HOME"], ".gemini"), { recursive: true });
  await mkdir(join(process.env["HOME"], ".config", "opencode"), { recursive: true });
  await mkdir(join(process.env["HOME"], ".pi", "agent"), { recursive: true });
  await writeFile(join(process.env["HOME"], ".gemini", "settings.json"), "{}\n");
  await writeFile(join(process.env["HOME"], ".config", "opencode", "opencode.json"), "{}\n");
  await writeFile(join(process.env["HOME"], ".pi", "agent", "settings.json"), JSON.stringify({
    packages: ["npm:pi-mcp-adapter"],
  }));
  await writeFile(join(process.env["HOME"], ".pi", "agent", "mcp.json"), "{}\n");
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function spec(overrides: Partial<McpServerSpec> = {}): McpServerSpec {
  return {
    transport: "http",
    url: "https://mcp.example.test",
    description: "Example MCP",
    vendor: "example",
    default_enabled: true,
    auth_env_vars: ["EXAMPLE_TOKEN"],
    agent_visibility: {
      "claude-code": false,
      codex: true,
      gemini: true,
      opencode: true,
      pi: true,
    },
    ...overrides,
  };
}

describe("MCP registry source", () => {
  test("registers, persists, enables, disables, and unregisters visible agents", async () => {
    await registerServer("example", spec());
    let registry = await loadRegistry();

    expect(registry.servers.example?.name).toBe("example");
    expect(isEnabled(registry.servers.example!, "codex")).toBe(true);
    expect(disabledConfigSupport(registry.servers.example!, "claude-code")).toBe("hidden");
    expect(disabledConfigSupport(registry.servers.example!, "codex")).toBe("native");
    expect(disabledConfigSupport(registry.servers.example!, "pi")).toBe("disabledConfigUnsupported");

    await setEnabled("example", false, { agents: ["codex", "gemini", "opencode", "pi"] });
    registry = await loadRegistry();
    expect(isEnabled(registry.servers.example!, "codex")).toBe(false);
    expect(isEnabled(registry.servers.example!, "pi")).toBe(false);

    await unregisterServer("example");
    expect((await loadRegistry()).servers.example).toBeUndefined();
  });

  test("applies HTTP registry entries to Codex, Gemini, OpenCode, and Pi then removes them", async () => {
    await registerServer("example", spec());
    await applyToAgents("example", { agents: ["codex", "gemini", "opencode", "pi"] });

    const codex = await readFile(join(process.env["HOME"]!, ".codex", "config.toml"), "utf8");
    expect(codex).toContain("[mcp_servers.example]");
    expect(codex).toContain('bearer_token_env_var = "EXAMPLE_TOKEN"');

    const gemini = JSON.parse(await readFile(join(process.env["HOME"]!, ".gemini", "settings.json"), "utf8"));
    expect(gemini.mcpServers.example).toEqual({
      httpUrl: "https://mcp.example.test",
      headers: { Authorization: "Bearer ${EXAMPLE_TOKEN}" },
    });

    const opencode = JSON.parse(await readFile(join(process.env["HOME"]!, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.mcp.example).toEqual({
      type: "remote",
      url: "https://mcp.example.test",
      headers: { Authorization: "Bearer {env:EXAMPLE_TOKEN}" },
      enabled: true,
    });

    const pi = JSON.parse(await readFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), "utf8"));
    expect(pi.mcpServers.example).toMatchObject({
      url: "https://mcp.example.test",
      directTools: true,
      headers: { Authorization: "Bearer ${EXAMPLE_TOKEN}" },
    });

    await removeFromAgents("example", { agents: ["codex", "gemini", "opencode", "pi"] });
    expect(await readFile(join(process.env["HOME"]!, ".codex", "config.toml"), "utf8")).not.toContain("example");
    expect(JSON.parse(await readFile(join(process.env["HOME"]!, ".gemini", "settings.json"), "utf8")).mcpServers.example).toBeUndefined();
    expect(JSON.parse(await readFile(join(process.env["HOME"]!, ".config", "opencode", "opencode.json"), "utf8")).mcp.example).toBeUndefined();
    expect(JSON.parse(await readFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), "utf8")).mcpServers).toBeUndefined();
  });

  test("keeps disabled servers configured where native support exists and strips unsupported agents", async () => {
    await registerServer("example", spec({ default_enabled: false }));
    await applyDisabledToAgents("example", { agents: ["codex", "gemini", "opencode", "pi"] });

    const codex = await readFile(join(process.env["HOME"]!, ".codex", "config.toml"), "utf8");
    expect(codex).toContain("enabled = false");

    const geminiEnablement = JSON.parse(
      await readFile(join(process.env["HOME"]!, ".gemini", "mcp-server-enablement.json"), "utf8"),
    );
    expect(geminiEnablement.example).toEqual({ enabled: false });

    const opencode = JSON.parse(await readFile(join(process.env["HOME"]!, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.mcp.example.enabled).toBe(false);

    const pi = JSON.parse(await readFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), "utf8"));
    expect(pi.mcpServers).toBeUndefined();
  });

  test("writes stdio command shapes and strips legacy Codex TOML layouts", async () => {
    await registerServer("stdio-example", spec({
      transport: "stdio",
      command: "node server.js --flag",
      url: undefined,
      auth_env_vars: [],
    }));
    await applyToAgents("stdio-example", { agents: ["codex", "gemini", "opencode", "pi"] });

    const codex = await readFile(join(process.env["HOME"]!, ".codex", "config.toml"), "utf8");
    expect(codex).toContain('command = "node"');
    expect(codex).toContain('args = ["server.js", "--flag"]');

    const gemini = JSON.parse(await readFile(join(process.env["HOME"]!, ".gemini", "settings.json"), "utf8"));
    expect(gemini.mcpServers["stdio-example"]).toEqual({ command: "node", args: ["server.js", "--flag"] });

    const opencode = JSON.parse(await readFile(join(process.env["HOME"]!, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.mcp["stdio-example"].command).toEqual(["node", "server.js", "--flag"]);

    const legacy = `[mcp_servers]\n"stdio-example" = { command = "old" }\n\n[mcp_servers.stdio-example]\ncommand = "old"\nargs = []\n`;
    expect(stripCodexMcpServerConfig(legacy, "stdio-example")).not.toContain("stdio-example");
  });

  test("skips invalid JSON agent configs without corrupting existing files", async () => {
    await writeFile(join(process.env["HOME"]!, ".gemini", "settings.json"), "[broken");
    await writeFile(join(process.env["HOME"]!, ".config", "opencode", "opencode.json"), "null");
    await writeFile(join(process.env["HOME"]!, ".pi", "agent", "settings.json"), "[broken");
    await writeFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), "[broken");

    await registerServer("example", spec());
    await applyToAgents("example", { agents: ["gemini", "opencode", "pi"] });

    expect(await readFile(join(process.env["HOME"]!, ".gemini", "settings.json"), "utf8")).toBe("[broken");
    expect(await readFile(join(process.env["HOME"]!, ".config", "opencode", "opencode.json"), "utf8")).toBe("null");
    expect(await readFile(join(process.env["HOME"]!, ".pi", "agent", "settings.json"), "utf8")).toBe("[broken");
    expect(await readFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), "utf8")).toBe("[broken");
  });

  test("updates existing Pi MCP entries and removes the final server section", async () => {
    await writeFile(join(process.env["HOME"]!, ".pi", "agent", "settings.json"), JSON.stringify({
      packages: ["npm:pi-mcp-adapter"],
    }));
    await writeFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), JSON.stringify({
      mcpServers: {
        example: {
          url: "https://old.example.test",
          directTools: false,
          keep: "preserved",
        },
      },
    }));

    await registerServer("example", spec());
    await applyToAgents("example", { agents: ["pi"] });

    const updated = JSON.parse(await readFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), "utf8"));
    expect(updated.mcpServers.example).toEqual({
      url: "https://old.example.test",
      directTools: true,
      keep: "preserved",
    });

    await removeFromAgents("example", { agents: ["pi"] });
    const removed = JSON.parse(await readFile(join(process.env["HOME"]!, ".pi", "agent", "mcp.json"), "utf8"));
    expect(removed.mcpServers).toBeUndefined();
  });

  test("removes hidden entries only when includeHidden is explicitly requested", async () => {
    await mkdir(join(process.env["HOME"]!, ".claude"), { recursive: true });
    await registerServer("hidden-codex", spec({
      agent_visibility: {
        "claude-code": false,
        codex: false,
        gemini: false,
        opencode: false,
        pi: false,
      },
    }));
    await writeFile(
      join(process.env["HOME"]!, ".codex", "config.toml"),
      `# BEGIN FULCRUM MCP hidden-codex\n[mcp_servers.hidden-codex]\nurl = "https://old.example.test"\n# END FULCRUM MCP hidden-codex\n`,
    );

    await removeFromAgents("hidden-codex", { agents: ["codex"] });
    expect(await readFile(join(process.env["HOME"]!, ".codex", "config.toml"), "utf8")).toContain("hidden-codex");

    await removeFromAgents("hidden-codex", { agents: ["codex"], includeHidden: true });
    expect(await readFile(join(process.env["HOME"]!, ".codex", "config.toml"), "utf8")).not.toContain("hidden-codex");
  });
});
