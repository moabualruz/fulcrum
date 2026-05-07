import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry } from "@fulcrum/cli/mcp-registry.ts";
import type { ComponentAction } from "../types.ts";
import { applyMcpAction, registerBuiltinMcpByName } from "./mcp.ts";

let tmp: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "fulcrum-component-mcp-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = tmp;
  process.env["FULCRUM_HOME"] = join(tmp, ".fulcrum");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;

  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;

  await rm(tmp, { recursive: true, force: true });
});

function mcpAction(overrides: Partial<ComponentAction>): ComponentAction {
  return {
    id: "mcp.context7:global",
    componentId: "mcp.context7",
    surfaceId: "mcp.context7:registry",
    operation: "install",
    kind: "mcp-registry-entry",
    target: "mcp.context7",
    change: "create-or-update",
    risk: "managed",
    reason: "test",
    payload: { name: "context7" },
    ...overrides,
  };
}

describe("registerBuiltinMcpByName", () => {
  test("registers context7 in registry", async () => {
    await registerBuiltinMcpByName("context7");

    const reg = await loadRegistry();
    expect(reg.servers["context7"]).toBeDefined();
    expect(reg.servers["context7"]?.url).toBe("https://mcp.context7.com/mcp");
  });

  test("enables github for Codex and writes bearer token env var", async () => {
    await mkdir(join(tmp, ".codex"), { recursive: true });

    await registerBuiltinMcpByName("github", { enabled: true, agents: ["codex"] });

    const reg = await loadRegistry();
    expect(reg.servers["github"]?.enabled.codex).toBe(true);

    const toml = await readFile(join(tmp, ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.github]");
    expect(toml).toContain('bearer_token_env_var = "GITHUB_TOKEN"');
    expect(toml).not.toContain("enabled = false");
  });

  test("unknown builtin throws clear error", async () => {
    await expect(registerBuiltinMcpByName("missing")).rejects.toThrow("unknown builtin MCP: missing");
  });
});

describe("applyMcpAction", () => {
  test("create-or-update mcp.context7 registers context7", async () => {
    await applyMcpAction(mcpAction({ change: "create-or-update" }));

    const reg = await loadRegistry();
    expect(reg.servers["context7"]).toBeDefined();
  });

  test("disable sets enabled false and preserves Codex disabled config for requested agent", async () => {
    await mkdir(join(tmp, ".codex"), { recursive: true });
    await registerBuiltinMcpByName("context7", { enabled: true, agents: ["codex"] });
    const installedToml = await readFile(join(tmp, ".codex", "config.toml"), "utf8");
    expect(installedToml).toContain("[mcp_servers.context7]");

    await applyMcpAction(
      mcpAction({
        change: "disable",
        agentId: "codex",
      }),
    );

    const reg = await loadRegistry();
    expect(reg.servers["context7"]?.enabled.codex).toBe(false);

    const disabledToml = await readFile(join(tmp, ".codex", "config.toml"), "utf8");
    expect(disabledToml).toContain("[mcp_servers.context7]");
    expect(disabledToml).toContain("enabled = false");
  });

  test("disable preserves Gemini and OpenCode disabled native config", async () => {
    await mkdir(join(tmp, ".gemini"), { recursive: true });
    await mkdir(join(tmp, ".config", "opencode"), { recursive: true });
    await registerBuiltinMcpByName("github", { enabled: true, agents: ["gemini", "opencode"] });

    await applyMcpAction(
      mcpAction({
        componentId: "mcp.github",
        payload: { name: "github" },
        change: "disable",
      }),
    );

    const reg = await loadRegistry();
    expect(reg.servers["github"]?.enabled.gemini).toBe(false);
    expect(reg.servers["github"]?.enabled.opencode).toBe(false);

    const geminiSettings = JSON.parse(await readFile(join(tmp, ".gemini", "settings.json"), "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
    const geminiEnablement = JSON.parse(await readFile(join(tmp, ".gemini", "mcp-server-enablement.json"), "utf8")) as {
      github?: { enabled: boolean };
    };
    const opencode = JSON.parse(await readFile(join(tmp, ".config", "opencode", "opencode.json"), "utf8")) as {
      mcp?: Record<string, Record<string, unknown>>;
    };
    expect(geminiSettings.mcpServers?.github).toBeDefined();
    expect(geminiEnablement.github?.enabled).toBe(false);
    expect(opencode.mcp?.github).toBeDefined();
    expect(opencode.mcp?.github?.enabled).toBe(false);
  });

  test("derives name from component id when payload name is absent", async () => {
    await applyMcpAction(
      mcpAction({
        payload: {},
        componentId: "mcp.context7",
        change: "create-or-update",
      }),
    );

    const reg = await loadRegistry();
    expect(reg.servers["context7"]).toBeDefined();
  });

  test("mcp.registry registers every builtin server and writes disabled native config", async () => {
    await mkdir(join(tmp, ".codex"), { recursive: true });
    await mkdir(join(tmp, ".gemini"), { recursive: true });
    await mkdir(join(tmp, ".config", "opencode"), { recursive: true });

    await applyMcpAction(
      mcpAction({
        componentId: "mcp.registry",
        payload: { name: "registry" },
        change: "create-or-update",
      }),
    );

    const reg = await loadRegistry();
    expect(Object.keys(reg.servers)).toHaveLength(17);
    expect(reg.servers["deepwiki"]?.url).toBe("https://mcp.deepwiki.com/mcp");

    const codexToml = await readFile(join(tmp, ".codex", "config.toml"), "utf8");
    expect(codexToml).toContain("[mcp_servers.context7]");
    expect(codexToml).toContain("enabled = false");

    const geminiEnablement = JSON.parse(await readFile(join(tmp, ".gemini", "mcp-server-enablement.json"), "utf8")) as {
      context7?: { enabled: boolean };
    };
    const opencode = JSON.parse(await readFile(join(tmp, ".config", "opencode", "opencode.json"), "utf8")) as {
      mcp?: Record<string, Record<string, unknown>>;
    };
    expect(geminiEnablement.context7?.enabled).toBe(false);
    expect(opencode.mcp?.context7?.enabled).toBe(false);
  });

  test("noop and preserve return without writes", async () => {
    await applyMcpAction(mcpAction({ change: "noop" }));
    await applyMcpAction(mcpAction({ change: "preserve" }));

    const reg = await loadRegistry();
    expect(Object.keys(reg.servers)).toEqual([]);
  });

  test("remove removes requested agent config", async () => {
    await mkdir(join(tmp, ".codex"), { recursive: true });
    await registerBuiltinMcpByName("github", { enabled: true, agents: ["codex"] });

    await applyMcpAction(
      mcpAction({
        componentId: "mcp.github",
        payload: { name: "github" },
        change: "remove",
        agentId: "codex",
      }),
    );

    const toml = await readFile(join(tmp, ".codex", "config.toml"), "utf8");
    expect(toml).not.toContain("[mcp_servers.github]");
  });

  test("enable derives agent scope from action agent id", async () => {
    await mkdir(join(tmp, ".codex"), { recursive: true });

    await applyMcpAction(
      mcpAction({
        componentId: "mcp.github",
        payload: { name: "github" },
        change: "enable",
        agentId: "codex",
      }),
    );

    const reg = await loadRegistry();
    expect(reg.servers["github"]?.enabled.codex).toBe(true);

    const toml = await readFile(join(tmp, ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.github]");
  });
});
