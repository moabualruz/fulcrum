// MCP registry — shared infrastructure for Wave 2 and Wave 3.
//
// Owns a TOML-formatted registry at ~/.fulcrum/state/global/mcp-registry.toml.
// Provides load/save, register/unregister, enable/disable, and applyToAgents /
// removeFromAgents — which push entries into each agent's native MCP config.
//
// The canonical list of managed servers lives in mcp-builtins.ts (BUILTIN_MCPS).
// DEFAULT_GITHUB_SERVER and DEFAULT_REPOMIX_SERVER are re-exported from there
// for backward compatibility with existing tests and callers.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { which, run as runProc } from "../utils/proc.ts";

// ── types ──────────────────────────────────────────────────────────────────

export type AgentId = "claude-code" | "codex" | "gemini" | "opencode" | "pi";

export const ALL_AGENT_IDS: readonly AgentId[] = [
  "claude-code",
  "codex",
  "gemini",
  "opencode",
  "pi",
];

export interface McpServerVisibility {
  "claude-code": boolean;
  codex: boolean;
  gemini: boolean;
  opencode: boolean;
  pi: boolean;
}

export interface McpServerSpec {
  transport: "http" | "stdio";
  /** Present when transport=http */
  url?: string;
  /** Present when transport=stdio — raw command string, e.g. "npx -y repomix --mcp" */
  command?: string;
  description: string;
  vendor: string;
  /** Whether install auto-applies to agents (most W2/W3 MCPs default false) */
  default_enabled: boolean;
  /** Env vars checked by doctor for auth readiness */
  auth_env_vars: string[];
  agent_visibility: McpServerVisibility;
}

export interface McpServer extends McpServerSpec {
  name: string;
  /** Per-agent enabled state (undefined = same as default_enabled) */
  enabled: Partial<Record<AgentId, boolean>>;
}

export interface Registry {
  schema_version: 1;
  servers: Record<string, McpServer>;
}

// ── registry path ──────────────────────────────────────────────────────────

function registryPath(): string {
  const fulcrumHome = process.env["FULCRUM_HOME"] ?? `${process.env["HOME"] ?? ""}/.fulcrum`;
  return `${fulcrumHome}/state/global/mcp-registry.toml`;
}

// ── file helpers ───────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function writeText(p: string, body: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body);
}

// ── TOML serialiser (minimal — no dep needed for our schema) ───────────────

function serializeRegistry(reg: Registry): string {
  const lines: string[] = [
    `schema_version = ${reg.schema_version}`,
    "",
  ];
  for (const [name, server] of Object.entries(reg.servers)) {
    lines.push(`[servers.${name}]`);
    lines.push(`transport = "${server.transport}"`);
    if (server.url !== undefined) lines.push(`url = "${server.url}"`);
    if (server.command !== undefined) lines.push(`command = ${JSON.stringify(server.command)}`);
    lines.push(`description = ${JSON.stringify(server.description)}`);
    lines.push(`vendor = "${server.vendor}"`);
    lines.push(`default_enabled = ${server.default_enabled}`);
    lines.push(
      `auth_env_vars = [${server.auth_env_vars.map((v) => JSON.stringify(v)).join(", ")}]`,
    );
    // Per-agent enabled overrides (only write non-default values)
    for (const [agentId, enabled] of Object.entries(server.enabled)) {
      lines.push(`enabled_${agentId.replace(/-/g, "_")} = ${enabled}`);
    }
    // Agent visibility
    lines.push(`[servers.${name}.agent_visibility]`);
    for (const agentId of ALL_AGENT_IDS) {
      lines.push(`"${agentId}" = ${server.agent_visibility[agentId]}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── TOML parser (hand-rolled for our narrow schema) ────────────────────────

function parseRegistry(raw: string): Registry {
  const reg: Registry = { schema_version: 1, servers: {} };
  let currentServer: McpServer | null = null;
  let inVisibility = false;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // [servers.<name>.agent_visibility]
    const visMatch = trimmed.match(/^\[servers\.([^\]]+)\.agent_visibility\]$/);
    if (visMatch) {
      inVisibility = true;
      continue;
    }

    // [servers.<name>]
    const serverMatch = trimmed.match(/^\[servers\.([^\]]+)\]$/);
    if (serverMatch) {
      const name = serverMatch[1]!;
      currentServer = {
        name,
        transport: "http",
        description: "",
        vendor: "",
        default_enabled: false,
        auth_env_vars: [],
        agent_visibility: {
          "claude-code": true, codex: true, gemini: true, opencode: true, pi: true,
        },
        enabled: {},
      };
      reg.servers[name] = currentServer;
      inVisibility = false;
      continue;
    }

    // schema_version = N (top-level)
    const svMatch = trimmed.match(/^schema_version\s*=\s*(\d+)$/);
    if (svMatch) {
      // already defaulted to 1
      continue;
    }

    // key = value pairs
    const kvMatch = trimmed.match(/^"?([^"=\s]+)"?\s*=\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1]!.trim();
    const rawVal = kvMatch[2]!.trim();

    const unquote = (s: string): string => {
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
      }
      return s;
    };

    const parseBool = (s: string): boolean => s.trim() === "true";

    const parseStrArray = (s: string): string[] => {
      const inner = s.replace(/^\[/, "").replace(/\]$/, "");
      if (!inner.trim()) return [];
      return inner.split(",").map((t) => unquote(t.trim()));
    };

    if (inVisibility && currentServer) {
      // agent visibility line: "claude-code" = true
      const agentId = unquote(key) as AgentId;
      if (ALL_AGENT_IDS.includes(agentId)) {
        currentServer.agent_visibility[agentId] = parseBool(rawVal);
      }
      continue;
    }

    if (!currentServer) continue;

    if (key === "transport") {
      currentServer.transport = unquote(rawVal) as "http" | "stdio";
    } else if (key === "url") {
      currentServer.url = unquote(rawVal);
    } else if (key === "command") {
      currentServer.command = unquote(rawVal);
    } else if (key === "description") {
      currentServer.description = unquote(rawVal);
    } else if (key === "vendor") {
      currentServer.vendor = unquote(rawVal);
    } else if (key === "default_enabled") {
      currentServer.default_enabled = parseBool(rawVal);
    } else if (key === "auth_env_vars") {
      currentServer.auth_env_vars = parseStrArray(rawVal);
    } else if (key.startsWith("enabled_")) {
      // enabled_claude_code → claude-code
      const agentKey = key.replace(/^enabled_/, "").replace(/_/g, "-") as AgentId;
      if (ALL_AGENT_IDS.includes(agentKey)) {
        currentServer.enabled[agentKey] = parseBool(rawVal);
      }
    }
  }
  return reg;
}

// ── public API ─────────────────────────────────────────────────────────────

export async function loadRegistry(): Promise<Registry> {
  const path = registryPath();
  if (!(await exists(path))) {
    return { schema_version: 1, servers: {} };
  }
  const raw = await readFile(path, "utf8");
  return parseRegistry(raw);
}

export async function saveRegistry(reg: Registry): Promise<void> {
  const path = registryPath();
  await writeText(path, serializeRegistry(reg));
}

export async function registerServer(name: string, spec: McpServerSpec): Promise<void> {
  const reg = await loadRegistry();
  reg.servers[name] = { name, ...spec, enabled: reg.servers[name]?.enabled ?? {} };
  await saveRegistry(reg);
}

export async function unregisterServer(name: string): Promise<void> {
  const reg = await loadRegistry();
  delete reg.servers[name];
  await saveRegistry(reg);
}

export function isEnabled(server: McpServer, agentId: AgentId): boolean {
  const override = server.enabled[agentId];
  return override !== undefined ? override : server.default_enabled;
}

export async function setEnabled(
  name: string,
  enabled: boolean,
  opts: { agents?: AgentId[] } = {},
): Promise<void> {
  const reg = await loadRegistry();
  const server = reg.servers[name];
  if (!server) throw new Error(`mcp-registry: server '${name}' not registered`);

  const targets = opts.agents ?? ALL_AGENT_IDS;
  for (const agentId of targets) {
    server.enabled[agentId] = enabled;
  }
  await saveRegistry(reg);
}

// ── agent-config helpers (parallel to mcp.ts helpers but server-agnostic) ──

const PI_MCP_ADAPTER_PKG = "npm:pi-mcp-adapter";

async function readJsonObject(file: string): Promise<Record<string, unknown> | null> {
  if (!(await exists(file))) return {};
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function writeJsonFile(file: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n");
}

function mcpValueForAgent(server: McpServer, agentId: AgentId): Record<string, unknown> {
  if (server.transport === "http") {
    if (agentId === "gemini") return { httpUrl: server.url! };
    if (agentId === "opencode") return { type: "remote", url: server.url! };
    if (agentId === "pi") return { url: server.url! };
    // claude-code uses `claude mcp add` command, codex uses TOML block
    return { url: server.url! };
  }
  // stdio
  const parts = server.command!.split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);
  if (agentId === "gemini") return { command: cmd, args };
  if (agentId === "opencode") return { type: "local", command: server.command! };
  if (agentId === "pi") return { command: cmd, args };
  return { command: cmd, args };
}

function tomlBlockBegin(name: string): string {
  return `# BEGIN FULCRUM MCP ${name}`;
}
function tomlBlockEnd(name: string): string {
  return `# END FULCRUM MCP ${name}`;
}

async function applyToCodex(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.codex/config.toml`;
  const BEGIN = tomlBlockBegin(server.name);
  const END = tomlBlockEnd(server.name);
  const existing = await (async () => {
    if (!(await exists(file))) return "";
    return readFile(file, "utf8");
  })();

  if (existing.includes(BEGIN)) {
    console.log(`     · Codex ${server.name} MCP already present`);
    return;
  }

  let entry: string;
  if (server.transport === "http") {
    entry = `[mcp_servers.${server.name}]\nurl = "${server.url}"`;
  } else {
    const parts = server.command!.split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1).map((a) => `"${a}"`).join(", ");
    entry = `[mcp_servers.${server.name}]\ncommand = "${cmd}"\nargs = [${args}]`;
  }

  const block = `${BEGIN}\n${entry}\n${END}\n`;
  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${existing}${sep}${block}`);
  console.log(`     ✓ Codex ${server.name} MCP registered`);
}

async function removeFromCodex(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.codex/config.toml`;
  const BEGIN = tomlBlockBegin(server.name);
  const END = tomlBlockEnd(server.name);
  if (!(await exists(file))) return;
  const existing = await readFile(file, "utf8");
  if (!existing.includes(BEGIN)) {
    console.log(`     · Codex ${server.name} MCP not present`);
    return;
  }
  const re = new RegExp(`\\n?${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "m");
  const out = existing.replace(re, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  await writeFile(file, out ? `${out}\n` : "");
  console.log(`     - Codex ${server.name} MCP removed`);
}

async function applyToGemini(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.gemini/settings.json`;
  const root = await readJsonObject(file);
  if (!root) { console.log(`     ✗ Gemini settings not JSON; skip`); return; }
  const section = root["mcpServers"] as Record<string, unknown> ?? {};
  if (section[server.name]) { console.log(`     · Gemini ${server.name} MCP already present`); return; }
  section[server.name] = mcpValueForAgent(server, "gemini");
  root["mcpServers"] = section;
  await writeJsonFile(file, root);
  console.log(`     ✓ Gemini ${server.name} MCP registered`);
}

async function removeFromGemini(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.gemini/settings.json`;
  const root = await readJsonObject(file);
  if (!root) return;
  const section = root["mcpServers"] as Record<string, unknown> | undefined;
  if (!section || !section[server.name]) { console.log(`     · Gemini ${server.name} MCP not present`); return; }
  delete section[server.name];
  await writeJsonFile(file, root);
  console.log(`     - Gemini ${server.name} MCP removed`);
}

async function applyToOpenCode(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.config/opencode/opencode.json`;
  const root = await readJsonObject(file);
  if (!root) { console.log(`     ✗ OpenCode config not JSON; skip`); return; }
  const section = root["mcp"] as Record<string, unknown> ?? {};
  if (section[server.name]) { console.log(`     · OpenCode ${server.name} MCP already present`); return; }
  section[server.name] = mcpValueForAgent(server, "opencode");
  root["mcp"] = section;
  await writeJsonFile(file, root);
  console.log(`     ✓ OpenCode ${server.name} MCP registered`);
}

async function removeFromOpenCode(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.config/opencode/opencode.json`;
  const root = await readJsonObject(file);
  if (!root) return;
  const section = root["mcp"] as Record<string, unknown> | undefined;
  if (!section || !section[server.name]) { console.log(`     · OpenCode ${server.name} MCP not present`); return; }
  delete section[server.name];
  await writeJsonFile(file, root);
  console.log(`     - OpenCode ${server.name} MCP removed`);
}

async function applyToPi(server: McpServer, home: string): Promise<void> {
  const agentDir = `${home}/.pi/agent`;
  if (!(await exists(agentDir))) { console.log(`     · Pi not detected; skip`); return; }

  // Ensure pi-mcp-adapter in settings.
  const settingsFile = `${agentDir}/settings.json`;
  const settings = await readJsonObject(settingsFile);
  if (!settings) { console.log(`     ✗ Pi settings not JSON; skip`); return; }
  const packages = settings["packages"];
  const pkgArray: string[] = Array.isArray(packages) ? packages as string[] : [];
  if (!pkgArray.includes(PI_MCP_ADAPTER_PKG)) {
    if (await which("pi")) {
      await runProc(["pi", "install", PI_MCP_ADAPTER_PKG]);
    }
    pkgArray.push(PI_MCP_ADAPTER_PKG);
    settings["packages"] = pkgArray;
    await writeJsonFile(settingsFile, settings);
  }

  // Write server entry in mcp.json.
  const mcpFile = `${agentDir}/mcp.json`;
  const mcpRoot = await readJsonObject(mcpFile);
  if (!mcpRoot) { console.log(`     ✗ Pi mcp.json not JSON; skip`); return; }
  const servers = (mcpRoot["mcpServers"] as Record<string, unknown>) ?? {};
  if (servers[server.name]) { console.log(`     · Pi ${server.name} MCP already present`); return; }
  servers[server.name] = mcpValueForAgent(server, "pi");
  mcpRoot["mcpServers"] = servers;
  await writeJsonFile(mcpFile, mcpRoot);
  console.log(`     ✓ Pi ${server.name} MCP registered`);
}

async function removeFromPi(server: McpServer, home: string): Promise<void> {
  const mcpFile = `${home}/.pi/agent/mcp.json`;
  if (!(await exists(`${home}/.pi/agent`))) return;
  const mcpRoot = await readJsonObject(mcpFile);
  if (!mcpRoot) return;
  const servers = mcpRoot["mcpServers"] as Record<string, unknown> | undefined;
  if (!servers || !servers[server.name]) { console.log(`     · Pi ${server.name} MCP not present`); return; }
  delete servers[server.name];
  if (Object.keys(servers).length === 0) delete mcpRoot["mcpServers"];
  await writeJsonFile(mcpFile, mcpRoot);
  console.log(`     - Pi ${server.name} MCP removed`);
}

async function applyToClaudeCode(server: McpServer, home: string, dryRun = false): Promise<void> {
  if (!(await exists(`${home}/.claude`))) {
    console.log(`     · Claude Code not detected; skip`);
    return;
  }
  if (!(await which("claude"))) {
    console.log(`     · claude not on PATH; skip ${server.name}`);
    return;
  }
  const args = server.transport === "http"
    ? ["claude", "mcp", "add", "-s", "user", server.name, "--transport", "http", server.url!]
    : (() => {
        const parts = server.command!.split(/\s+/);
        return ["claude", "mcp", "add", "-s", "user", server.name, "--transport", "stdio", "--", ...parts];
      })();
  if (dryRun) {
    console.log(`     [dry-run] would run: ${args.join(" ")}`);
  } else {
    await runProc(args);
  }
  console.log(`     ✓ Claude Code ${server.name} MCP requested`);
}

async function removeFromClaudeCode(server: McpServer, home: string, dryRun = false): Promise<void> {
  if (!(await exists(`${home}/.claude`))) return;
  if (!(await which("claude"))) {
    console.log(`     · Claude Code ${server.name}: claude not on PATH — manual: claude mcp remove -s user ${server.name}`);
    return;
  }
  const args = ["claude", "mcp", "remove", "-s", "user", server.name];
  if (dryRun) {
    console.log(`     [dry-run] would run: ${args.join(" ")}`);
  } else {
    const r = await runProc(args);
    if (r.exit !== 0) {
      console.log(`     · Claude Code ${server.name} MCP not found or already removed`);
      return;
    }
  }
  console.log(`     - Claude Code ${server.name} MCP removed`);
}

/** Push all enabled-agent entries into each agent's native MCP config. Idempotent. */
export async function applyToAgents(name: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  const reg = await loadRegistry();
  const server = reg.servers[name];
  if (!server) throw new Error(`mcp-registry: server '${name}' not registered`);
  const home = process.env["HOME"] ?? "";
  const dryRun = opts.dryRun ?? false;

  for (const agentId of ALL_AGENT_IDS) {
    if (!server.agent_visibility[agentId]) continue;
    if (!isEnabled(server, agentId)) continue;

    switch (agentId) {
      case "claude-code": await applyToClaudeCode(server, home, dryRun); break;
      case "codex":       if (await exists(`${home}/.codex`)) await applyToCodex(server, home); else console.log(`     · Codex not detected`); break;
      case "gemini":      if (await exists(`${home}/.gemini`)) await applyToGemini(server, home); else console.log(`     · Gemini not detected`); break;
      case "opencode":    if (await exists(`${home}/.config/opencode`)) await applyToOpenCode(server, home); else console.log(`     · OpenCode not detected`); break;
      case "pi":          await applyToPi(server, home); break;
    }
  }
}

/** Undo applyToAgents — remove from every agent's native MCP config regardless of enabled state. */
export async function removeFromAgents(name: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  const reg = await loadRegistry();
  const server = reg.servers[name];
  if (!server) return; // already gone
  const home = process.env["HOME"] ?? "";
  const dryRun = opts.dryRun ?? false;

  await removeFromClaudeCode(server, home, dryRun);
  if (await exists(`${home}/.codex`)) await removeFromCodex(server, home);
  if (await exists(`${home}/.gemini`)) await removeFromGemini(server, home);
  if (await exists(`${home}/.config/opencode`)) await removeFromOpenCode(server, home);
  if (await exists(`${home}/.pi/agent`)) await removeFromPi(server, home);
}

// ── default servers (re-exported from mcp-builtins for backward compat) ───

export { DEFAULT_GITHUB_SERVER, DEFAULT_REPOMIX_SERVER } from "./mcp-builtins.ts";
