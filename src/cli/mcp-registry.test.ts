// Tests for src/cli/mcp-registry.ts
// All writes go to scratch HOME dirs; no real $HOME touched.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRegistry,
  saveRegistry,
  registerServer,
  unregisterServer,
  setEnabled,
  isEnabled,
  applyToAgents,
  removeFromAgents,
  DEFAULT_GITHUB_SERVER,
  DEFAULT_REPOMIX_SERVER,
  ALL_AGENT_IDS,
  type Registry,
} from "./mcp-registry.ts";
import {
  DEFAULT_SEMGREP_SERVER,
  DEFAULT_CONTEXT7_SERVER,
  DEFAULT_TAVILY_SERVER,
  DEFAULT_PLAYWRIGHT_SERVER,
  DEFAULT_DART_SERVER,
  DEFAULT_CLOUDFLARE_DOCS_SERVER,
  DEFAULT_CLOUDFLARE_WORKERS_BINDINGS_SERVER,
  DEFAULT_CLOUDFLARE_RADAR_SERVER,
  BUILTIN_MCPS,
} from "./mcp-builtins.ts";

let TMP: string;
let origHome: string | undefined;
let origFulcrumHome: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-mcp-reg-"));
  origHome = process.env["HOME"];
  origFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
});

afterEach(async () => {
  if (origHome !== undefined) process.env["HOME"] = origHome;
  else delete process.env["HOME"];
  if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(TMP, { recursive: true, force: true });
});

// ── load empty registry ─────────────────────────────────────────────────────

describe("loadRegistry", () => {
  test("returns empty registry when file does not exist", async () => {
    const reg = await loadRegistry();
    expect(reg.schema_version).toBe(1);
    expect(Object.keys(reg.servers)).toHaveLength(0);
  });

  test("round-trips schema_version=1 on save+load", async () => {
    const reg: Registry = { schema_version: 1, servers: {} };
    await saveRegistry(reg);
    const loaded = await loadRegistry();
    expect(loaded.schema_version).toBe(1);
  });
});

// ── registerServer + saveRegistry ──────────────────────────────────────────

describe("registerServer", () => {
  test("registers github server and persists", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const reg = await loadRegistry();
    expect(reg.servers["github"]).toBeDefined();
    const s = reg.servers["github"]!;
    expect(s.transport).toBe("http");
    expect(s.url).toBe("https://api.githubcopilot.com/mcp/");
    expect(s.vendor).toBe("github");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toContain("GITHUB_TOKEN");
  });

  test("registers repomix server and persists", async () => {
    await registerServer("repomix", DEFAULT_REPOMIX_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["repomix"]!;
    expect(s.transport).toBe("stdio");
    expect(s.command).toBe("npx -y repomix --mcp");
    expect(s.vendor).toBe("yamadashy");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toHaveLength(0);
  });

  test("idempotent — re-registering does not duplicate", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const reg = await loadRegistry();
    expect(Object.keys(reg.servers).filter((k) => k === "github")).toHaveLength(1);
  });

  test("all 5 agent visibility flags default true", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["github"]!;
    for (const id of ALL_AGENT_IDS) {
      expect(s.agent_visibility[id]).toBe(true);
    }
  });
});

// ── unregisterServer ────────────────────────────────────────────────────────

describe("unregisterServer", () => {
  test("removes server entry", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await unregisterServer("github");
    const reg = await loadRegistry();
    expect(reg.servers["github"]).toBeUndefined();
  });

  test("no-op on non-existent server", async () => {
    await expect(unregisterServer("nonexistent")).resolves.toBeUndefined();
  });
});

// ── isEnabled / setEnabled ─────────────────────────────────────────────────

describe("isEnabled / setEnabled", () => {
  test("all agents disabled by default (default_enabled=false)", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["github"]!;
    for (const id of ALL_AGENT_IDS) {
      expect(isEnabled(s, id)).toBe(false);
    }
  });

  test("setEnabled true for all agents persists", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: [...ALL_AGENT_IDS] });
    const reg = await loadRegistry();
    const s = reg.servers["github"]!;
    for (const id of ALL_AGENT_IDS) {
      expect(isEnabled(s, id)).toBe(true);
    }
  });

  test("setEnabled for specific agent only", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: ["codex"] });
    const reg = await loadRegistry();
    const s = reg.servers["github"]!;
    expect(isEnabled(s, "codex")).toBe(true);
    expect(isEnabled(s, "claude-code")).toBe(false);
    expect(isEnabled(s, "gemini")).toBe(false);
  });

  test("setEnabled false disables previously enabled agent", async () => {
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true);
    await setEnabled("github", false, { agents: ["gemini"] });
    const reg = await loadRegistry();
    const s = reg.servers["github"]!;
    expect(isEnabled(s, "gemini")).toBe(false);
    expect(isEnabled(s, "codex")).toBe(true);
  });

  test("throws on unknown server name", async () => {
    await expect(setEnabled("nonexistent", true)).rejects.toThrow("not registered");
  });
});

// ── applyToAgents / removeFromAgents ────────────────────────────────────────

describe("applyToAgents", () => {
  test("writes Codex TOML block for enabled agent when .codex exists", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: ["codex"] });

    await applyToAgents("github");

    const toml = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.github]");
    expect(toml).toContain("https://api.githubcopilot.com/mcp/");
  });

  test("writes Gemini settings.json for enabled agent when .gemini exists", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: ["gemini"] });

    await applyToAgents("github");

    const raw = await readFile(join(TMP, ".gemini", "settings.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcpServers = parsed["mcpServers"] as Record<string, unknown>;
    expect(mcpServers).toBeDefined();
    expect(mcpServers["github"]).toBeDefined();
  });

  test("writes OpenCode opencode.json for enabled agent when dir exists", async () => {
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: ["opencode"] });

    await applyToAgents("github");

    const raw = await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcp = parsed["mcp"] as Record<string, unknown>;
    expect(mcp["github"]).toBeDefined();
  });

  test("idempotent — second call does not duplicate Codex entry", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await registerServer("repomix", DEFAULT_REPOMIX_SERVER);
    await setEnabled("repomix", true, { agents: ["codex"] });

    await applyToAgents("repomix");
    await applyToAgents("repomix"); // second call

    const toml = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    const count = (toml.match(/\[mcp_servers\.repomix\]/g) ?? []).length;
    expect(count).toBe(1);
  });

  test("skips non-detected agent dirs silently", async () => {
    // No .codex, .gemini, etc. created — just register and enable.
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true);
    // Should not throw even when agent dirs absent.
    await expect(applyToAgents("github")).resolves.toBeUndefined();
  });
});

describe("removeFromAgents", () => {
  test("removes Codex TOML block", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: ["codex"] });
    await applyToAgents("github");

    await removeFromAgents("github");

    const toml = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(toml).not.toContain("[mcp_servers.github]");
  });

  test("removes Gemini settings.json entry", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: ["gemini"] });
    await applyToAgents("github");

    await removeFromAgents("github");

    const raw = await readFile(join(TMP, ".gemini", "settings.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcpServers = (parsed["mcpServers"] ?? {}) as Record<string, unknown>;
    expect(mcpServers["github"]).toBeUndefined();
  });

  test("no-op on non-existent server (does not throw)", async () => {
    await expect(removeFromAgents("nonexistent")).resolves.toBeUndefined();
  });

  test("idempotent — second removeFromAgents does not throw", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await setEnabled("github", true, { agents: ["codex"] });
    await applyToAgents("github");
    await removeFromAgents("github");
    await expect(removeFromAgents("github")).resolves.toBeUndefined();
  });
});

// ── W3 server specs ─────────────────────────────────────────────────────────

describe("W3 server registrations", () => {
  // ── semgrep ──────────────────────────────────────────────────────────────
  test("semgrep: stdio transport, correct command, no auth", async () => {
    await registerServer("semgrep", DEFAULT_SEMGREP_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["semgrep"]!;
    expect(s.transport).toBe("stdio");
    expect(s.command).toBe("semgrep mcp");
    expect(s.vendor).toBe("semgrep");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toHaveLength(0);
    for (const id of ALL_AGENT_IDS) expect(s.agent_visibility[id]).toBe(true);
  });

  // ── context7 ─────────────────────────────────────────────────────────────
  test("context7: http transport, correct URL, optional API key", async () => {
    await registerServer("context7", DEFAULT_CONTEXT7_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["context7"]!;
    expect(s.transport).toBe("http");
    expect(s.url).toBe("https://mcp.context7.com/mcp");
    expect(s.vendor).toBe("upstash");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toContain("CONTEXT7_API_KEY");
    for (const id of ALL_AGENT_IDS) expect(s.agent_visibility[id]).toBe(true);
  });

  // ── tavily ───────────────────────────────────────────────────────────────
  test("tavily: http transport, correct URL, requires TAVILY_API_KEY", async () => {
    await registerServer("tavily", DEFAULT_TAVILY_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["tavily"]!;
    expect(s.transport).toBe("http");
    expect(s.url).toBe("https://mcp.tavily.com/mcp/");
    expect(s.vendor).toBe("tavily-ai");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toContain("TAVILY_API_KEY");
    for (const id of ALL_AGENT_IDS) expect(s.agent_visibility[id]).toBe(true);
  });

  // ── playwright ───────────────────────────────────────────────────────────
  test("playwright: stdio transport, npx command, no auth", async () => {
    await registerServer("playwright", DEFAULT_PLAYWRIGHT_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["playwright"]!;
    expect(s.transport).toBe("stdio");
    expect(s.command).toBe("npx -y @playwright/mcp@latest");
    expect(s.vendor).toBe("microsoft");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toHaveLength(0);
    for (const id of ALL_AGENT_IDS) expect(s.agent_visibility[id]).toBe(true);
  });

  // ── dart ─────────────────────────────────────────────────────────────────
  test("dart: stdio transport, dart mcp-server command, no auth", async () => {
    await registerServer("dart", DEFAULT_DART_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["dart"]!;
    expect(s.transport).toBe("stdio");
    expect(s.command).toBe("dart mcp-server");
    expect(s.vendor).toBe("dart-lang");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toHaveLength(0);
    for (const id of ALL_AGENT_IDS) expect(s.agent_visibility[id]).toBe(true);
  });

  // ── cloudflare-docs (public, no auth) ───────────────────────────────────
  test("cloudflare-docs: http, public URL, no auth", async () => {
    await registerServer("cloudflare-docs", DEFAULT_CLOUDFLARE_DOCS_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["cloudflare-docs"]!;
    expect(s.transport).toBe("http");
    expect(s.url).toBe("https://docs.mcp.cloudflare.com/mcp");
    expect(s.vendor).toBe("cloudflare");
    expect(s.default_enabled).toBe(false);
    expect(s.auth_env_vars).toHaveLength(0);
  });

  // ── cloudflare-workers-bindings (requires auth) ──────────────────────────
  test("cloudflare-workers-bindings: http, requires CLOUDFLARE_API_TOKEN", async () => {
    await registerServer("cloudflare-workers-bindings", DEFAULT_CLOUDFLARE_WORKERS_BINDINGS_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["cloudflare-workers-bindings"]!;
    expect(s.transport).toBe("http");
    expect(s.url).toBe("https://bindings.mcp.cloudflare.com/mcp");
    expect(s.vendor).toBe("cloudflare");
    expect(s.auth_env_vars).toContain("CLOUDFLARE_API_TOKEN");
  });

  // ── cloudflare-radar ─────────────────────────────────────────────────────
  test("cloudflare-radar: http, correct URL, requires auth", async () => {
    await registerServer("cloudflare-radar", DEFAULT_CLOUDFLARE_RADAR_SERVER);
    const reg = await loadRegistry();
    const s = reg.servers["cloudflare-radar"]!;
    expect(s.url).toBe("https://radar.mcp.cloudflare.com/mcp");
    expect(s.auth_env_vars).toContain("CLOUDFLARE_API_TOKEN");
  });

  // ── BUILTIN_MCPS completeness ────────────────────────────────────────────
  test("BUILTIN_MCPS contains all 16 entries with unique names", () => {
    expect(BUILTIN_MCPS.length).toBe(16);
    const names = BUILTIN_MCPS.map((e) => e.name);
    expect(new Set(names).size).toBe(16); // all unique
    // Spot-check key entries are present
    expect(names).toContain("github");
    expect(names).toContain("repomix");
    expect(names).toContain("semgrep");
    expect(names).toContain("context7");
    expect(names).toContain("tavily");
    expect(names).toContain("playwright");
    expect(names).toContain("dart");
    expect(names).toContain("cloudflare-docs");
    expect(names).toContain("cloudflare-workers-bindings");
    expect(names).toContain("cloudflare-workers-builds");
    expect(names).toContain("cloudflare-observability");
    expect(names).toContain("cloudflare-radar");
    expect(names).toContain("cloudflare-logpush");
    expect(names).toContain("cloudflare-browser");
    expect(names).toContain("cloudflare-containers");
    expect(names).toContain("cloudflare-ai-gateway");
  });

  // ── round-trip: register all builtins, applyToAgents (Codex), removeFromAgents ──
  test("round-trip: register all builtins, apply to Codex, remove", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });

    // Register all
    for (const { name, spec } of BUILTIN_MCPS) {
      await registerServer(name, spec);
    }

    // Enable context7 for codex and apply
    await setEnabled("context7", true, { agents: ["codex"] });
    await applyToAgents("context7");

    const toml = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.context7]");
    expect(toml).toContain("https://mcp.context7.com/mcp");

    // Remove
    await removeFromAgents("context7");
    const tomlAfter = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(tomlAfter).not.toContain("[mcp_servers.context7]");
  });

  test("round-trip: register tavily, apply to Gemini, remove", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await registerServer("tavily", DEFAULT_TAVILY_SERVER);
    await setEnabled("tavily", true, { agents: ["gemini"] });
    await applyToAgents("tavily");

    const raw = await readFile(join(TMP, ".gemini", "settings.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcpServers = parsed["mcpServers"] as Record<string, unknown>;
    expect(mcpServers["tavily"]).toBeDefined();

    await removeFromAgents("tavily");
    const rawAfter = await readFile(join(TMP, ".gemini", "settings.json"), "utf8");
    const parsedAfter = JSON.parse(rawAfter) as Record<string, unknown>;
    const mcpAfter = (parsedAfter["mcpServers"] ?? {}) as Record<string, unknown>;
    expect(mcpAfter["tavily"]).toBeUndefined();
  });

  test("round-trip: register playwright, apply to OpenCode, remove", async () => {
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await registerServer("playwright", DEFAULT_PLAYWRIGHT_SERVER);
    await setEnabled("playwright", true, { agents: ["opencode"] });
    await applyToAgents("playwright");

    const raw = await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcp = parsed["mcp"] as Record<string, unknown>;
    expect(mcp["playwright"]).toBeDefined();

    await removeFromAgents("playwright");
    const rawAfter = await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8");
    const parsedAfter = JSON.parse(rawAfter) as Record<string, unknown>;
    const mcpAfter = (parsedAfter["mcp"] ?? {}) as Record<string, unknown>;
    expect(mcpAfter["playwright"]).toBeUndefined();
  });
});
