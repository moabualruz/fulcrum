// MCP registry — shared infrastructure for Wave 2 and Wave 3.
//
// Owns a TOML-formatted registry at ~/.fulcrum/state/global/mcp-registry.toml.
// Provides load/save, register/unregister, enable/disable, and applyToAgents /
// removeFromAgents — which push entries into each agent's native MCP config.
//
// The canonical list of managed servers lives in mcp-builtins.ts (BUILTIN_MCPS).
// DEFAULT_GITHUB_SERVER is re-exported from there for backward compatibility
// with existing tests and callers.

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse as parseToml } from "smol-toml";
import { which, run as runProc } from "@/utils/proc.ts";

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
  /** Present when transport=stdio — raw command string. */
  command?: string;
  description: string;
  vendor: string;
  /** Whether install auto-applies to agents (most W2/W3 MCPs default false) */
  default_enabled: boolean;
  /** Env vars checked by doctor for auth readiness */
  auth_env_vars: string[];
  /**
   * true = Fulcrum MCP registry owns this agent's MCP config surface.
   * false = unsupported OR owned by another managed vendor primitive
   * (plugin/extension/package). Registry enable/disable/remove must skip it.
   */
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

async function writeCodexToml(p: string, body: string): Promise<void> {
  const out = body.endsWith("\n") ? body : `${body}\n`;
  try {
    parseToml(out);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`refusing to write invalid Codex config ${p}: ${message}`);
  }

  await mkdir(dirname(p), { recursive: true });
  const tmp = `${p}.fulcrum-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, out);
  try {
    await rename(tmp, p);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
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
    if (!server.agent_visibility[agentId]) continue;
    server.enabled[agentId] = enabled;
  }
  await saveRegistry(reg);
}

// ── agent-config helpers (parallel to mcp.ts helpers but server-agnostic) ──

const PI_MCP_ADAPTER_PKG = "npm:pi-mcp-adapter";
const PI_DART_DIRECT_TOOLS = [
  "read_package_uris",
  "launch_app",
  "stop_app",
  "get_app_logs",
  "connect_dart_tooling_daemon",
  "get_runtime_errors",
  "hot_reload",
  "get_widget_tree",
  "set_widget_selection_mode",
  "flutter_driver",
  "pub_dev_search",
  "remove_roots",
  "add_roots",
  "dart_fix",
  "dart_format",
  "run_tests",
  "create_project",
  "pub",
  "analyze_files",
  "resolve_workspace_symbol",
  "signature_help",
  "hover",
] as const;

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

function supportsNativeDisabled(agentId: AgentId): boolean {
  return agentId === "codex" || agentId === "gemini" || agentId === "opencode";
}

export type DisabledConfigSupport = "native" | "disabledConfigUnsupported" | "hidden";

export function disabledConfigSupport(server: McpServer, agentId: AgentId): DisabledConfigSupport {
  if (!server.agent_visibility[agentId]) return "hidden";
  return supportsNativeDisabled(agentId) ? "native" : "disabledConfigUnsupported";
}

function mcpValueForAgent(server: McpServer, agentId: AgentId): Record<string, unknown> {
  if (server.transport === "http") {
    // Per-agent env-interpolation syntax for Authorization Bearer header.
    // Gemini, Claude Code: `${VAR}` form (settings.json interpolation).
    // OpenCode:            `{env:VAR}` form (per opencode.json schema).
    // Codex doesn't use a `headers` field — it has `bearer_token_env_var`
    // emitted by `applyToCodex` in TOML, not here.
    const envVar = server.auth_env_vars.length === 1 ? server.auth_env_vars[0] : null;
    const bearer = (form: "dollar" | "envcurly") =>
      form === "dollar" ? `Bearer \${${envVar}}` : `Bearer {env:${envVar}}`;
    if (agentId === "gemini") {
      const v: Record<string, unknown> = { httpUrl: server.url! };
      if (envVar) v.headers = { Authorization: bearer("dollar") };
      return v;
    }
    if (agentId === "opencode") {
      const v: Record<string, unknown> = { type: "remote", url: server.url! };
      if (envVar) v.headers = { Authorization: bearer("envcurly") };
      return v;
    }
    if (agentId === "pi") {
      const v: Record<string, unknown> = { url: server.url!, directTools: piDirectToolsFor(server) };
      if (envVar) v.headers = { Authorization: bearer("dollar") };
      return v;
    }
    // claude-code (~/.claude.json mcpServers.<name>)
    const v: Record<string, unknown> = { url: server.url! };
    if (envVar) v.headers = { Authorization: bearer("dollar") };
    return v;
  }
  // stdio
  const parts = server.command!.split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);
  if (agentId === "gemini") return { command: cmd, args };
  // OpenCode `McpLocalConfig.command` is an array of strings (bin + args),
  // not a single command line. Confirmed against sst/opencode schema —
  // a string value triggers `Invalid input mcp.<name>` at startup.
  if (agentId === "opencode") return { type: "local", command: [cmd, ...args] };
  if (agentId === "pi") return { command: cmd, args, directTools: piDirectToolsFor(server) };
  return { command: cmd, args };
}

function piDirectToolsFor(server: McpServer): true | string[] {
  // Dart MCP vended 5 zero-arg tools without `properties` in inputSchema.
  // Pi v0.70.6 rejects those as direct tools; proxy calls still work.
  return server.name === "dart" ? [...PI_DART_DIRECT_TOOLS] : true;
}

function tomlBlockBegin(name: string): string {
  return `# BEGIN FULCRUM MCP ${name}`;
}
function tomlBlockEnd(name: string): string {
  return `# END FULCRUM MCP ${name}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceManagedBlock(existing: string, begin: string, end: string, replacement: string): string {
  const start = existing.indexOf(begin);
  if (start === -1) return existing;

  const firstEnd = existing.indexOf(end, start + begin.length);
  const removeStart = start;
  let removeEnd = firstEnd === -1
    ? findNextTomlBoundary(existing, start + begin.length)
    : firstEnd + end.length;

  // Older buggy adoption could leave duplicated keys plus a second END marker
  // before the next TOML section. Treat only that same-MCP orphan tail as ours.
  if (firstEnd !== -1) {
    const boundary = findNextTomlBoundary(existing, removeEnd);
    const tail = existing.slice(removeEnd, boundary);
    const orphanEnd = tail.lastIndexOf(end);
    if (orphanEnd !== -1) {
      removeEnd += orphanEnd + end.length;
    }
  }

  let after = existing.slice(removeEnd);
  if (after.startsWith("\n")) after = after.slice(1);
  return `${existing.slice(0, removeStart)}${replacement}${after}`;
}

export function stripCodexMcpServerConfig(existing: string, name: string): string {
  const begin = tomlBlockBegin(name);
  const end = tomlBlockEnd(name);
  let next = existing;
  while (next.includes(begin)) {
    const replaced = replaceManagedBlock(next, begin, end, "");
    if (replaced === next) break;
    next = replaced;
  }
  next = stripCodexMcpDottedTables(next, name);
  next = stripCodexMcpParentTableKey(next, name);
  return next.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function upsertCodexMcpServerConfig(existing: string, name: string, block: string): string {
  const stripped = stripCodexMcpServerConfig(existing, name);
  const sep = stripped && !stripped.endsWith("\n") ? "\n\n" : stripped ? "\n" : "";
  return `${stripped}${sep}${block}`;
}

function findNextTomlBoundary(existing: string, from: number): number {
  const rest = existing.slice(from);
  const indexes = ["\n[", "\n# BEGIN FULCRUM MCP "]
    .map((needle) => rest.indexOf(needle))
    .filter((idx) => idx !== -1);
  return indexes.length === 0 ? existing.length : from + Math.min(...indexes);
}

function stripCodexMcpDottedTables(existing: string, name: string): string {
  const tableName = codexMcpNamePattern(name);
  const re = new RegExp(
    `(^|\\n)\\[\\s*mcp_servers\\s*\\.\\s*${tableName}\\s*\\]\\n[\\s\\S]*?(?=\\n\\[|\\n# BEGIN FULCRUM MCP |$)`,
    "g",
  );
  return existing.replace(re, "");
}

function stripCodexMcpParentTableKey(existing: string, name: string): string {
  const keyRe = new RegExp(`^\\s*${codexMcpNamePattern(name)}\\s*=`);
  const lines = existing.split(/\n/);
  let inMcpServersTable = false;
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      inMcpServersTable = /^\s*\[\s*mcp_servers\s*\]\s*$/.test(line);
      kept.push(line);
      continue;
    }
    if (inMcpServersTable && keyRe.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

function codexMcpNamePattern(name: string): string {
  const escaped = escapeRegExp(name);
  return `(?:${escaped}|"${escaped}"|'${escaped}')`;
}

async function applyToCodex(server: McpServer, home: string, enabled = true): Promise<void> {
  const file = `${home}/.codex/config.toml`;
  const BEGIN = tomlBlockBegin(server.name);
  const END = tomlBlockEnd(server.name);
  const existing = await (async () => {
    if (!(await exists(file))) return "";
    return readFile(file, "utf8");
  })();

  let entry: string;
  if (server.transport === "http") {
    entry = `[mcp_servers.${server.name}]\nurl = "${server.url}"`;
    // Wire bearer token from env when a single auth_env_var is declared.
    // Codex supports `bearer_token_env_var` for streamable-HTTP MCP servers
    // (https://developers.openai.com/codex/config-reference). Without this,
    // the MCP receives no Authorization header and either errors or falls
    // through to interactive OAuth (`codex mcp login <name>`).
    if (server.auth_env_vars.length === 1) {
      entry += `\nbearer_token_env_var = "${server.auth_env_vars[0]}"`;
    }
  } else {
    const parts = server.command!.split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1).map((a) => `"${a}"`).join(", ");
    entry = `[mcp_servers.${server.name}]\ncommand = "${cmd}"\nargs = [${args}]`;
  }
  if (!enabled) entry += "\nenabled = false";

  const block = `${BEGIN}\n${entry}\n${END}\n`;
  await mkdir(dirname(file), { recursive: true });
  const next = upsertCodexMcpServerConfig(existing, server.name, block);
  await writeCodexToml(file, next);
  console.log(`     ✓ Codex ${server.name} MCP ${enabled ? "enabled" : "registered disabled"}`);
}

async function removeFromCodex(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.codex/config.toml`;
  const BEGIN = tomlBlockBegin(server.name);
  const END = tomlBlockEnd(server.name);
  if (!(await exists(file))) return;
  const existing = await readFile(file, "utf8");
  const next = stripCodexMcpServerConfig(existing, server.name);
  if (next === existing.trimEnd()) {
    console.log(`     · Codex ${server.name} MCP not present`);
    return;
  }
  await writeCodexToml(file, next ? `${next}\n` : "");
  console.log(`     - Codex ${server.name} MCP removed`);
}

function normalizeGeminiServerId(name: string): string {
  return name.toLowerCase().trim();
}

async function setGeminiMcpEnabled(home: string, name: string, enabled: boolean): Promise<void> {
  const file = `${home}/.gemini/mcp-server-enablement.json`;
  const root = await readJsonObject(file);
  const enablement = root ?? {};
  const key = normalizeGeminiServerId(name);
  if (enabled) {
    delete enablement[key];
  } else {
    enablement[key] = { enabled: false };
  }
  await writeJsonFile(file, enablement);
}

async function applyToGemini(server: McpServer, home: string, enabled = true): Promise<void> {
  const file = `${home}/.gemini/settings.json`;
  const root = await readJsonObject(file);
  if (!root) { console.log(`     ✗ Gemini settings not JSON; skip`); return; }
  const section = root["mcpServers"] as Record<string, unknown> ?? {};
  section[server.name] = mcpValueForAgent(server, "gemini");
  root["mcpServers"] = section;
  await writeJsonFile(file, root);
  await setGeminiMcpEnabled(home, server.name, enabled);
  console.log(`     ✓ Gemini ${server.name} MCP ${enabled ? "enabled" : "registered disabled"}`);
}

async function removeFromGemini(server: McpServer, home: string): Promise<void> {
  const file = `${home}/.gemini/settings.json`;
  const root = await readJsonObject(file);
  if (!root) return;
  const section = root["mcpServers"] as Record<string, unknown> | undefined;
  if (!section || !section[server.name]) {
    await setGeminiMcpEnabled(home, server.name, true);
    console.log(`     · Gemini ${server.name} MCP not present`);
    return;
  }
  delete section[server.name];
  await setGeminiMcpEnabled(home, server.name, true);
  await writeJsonFile(file, root);
  console.log(`     - Gemini ${server.name} MCP removed`);
}

async function applyToOpenCode(server: McpServer, home: string, enabled = true): Promise<void> {
  const file = `${home}/.config/opencode/opencode.json`;
  const root = await readJsonObject(file);
  if (!root) { console.log(`     ✗ OpenCode config not JSON; skip`); return; }
  const section = root["mcp"] as Record<string, unknown> ?? {};
  section[server.name] = { ...mcpValueForAgent(server, "opencode"), enabled };
  root["mcp"] = section;
  await writeJsonFile(file, root);
  console.log(`     ✓ OpenCode ${server.name} MCP ${enabled ? "enabled" : "registered disabled"}`);
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
  const desired = mcpValueForAgent(server, "pi");
  if (servers[server.name]) {
    const existing = servers[server.name];
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      servers[server.name] = {
        ...(existing as Record<string, unknown>),
        directTools: desired["directTools"],
      };
      mcpRoot["mcpServers"] = servers;
      await writeJsonFile(mcpFile, mcpRoot);
      console.log(`     ✓ Pi ${server.name} MCP updated`);
      return;
    }
    console.log(`     · Pi ${server.name} MCP already present`);
    return;
  }
  servers[server.name] = desired;
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
  const args: string[] = server.transport === "http"
    ? ["claude", "mcp", "add", "-s", "user", server.name, "--transport", "http", server.url!]
    : (() => {
        const parts = server.command!.split(/\s+/);
        return ["claude", "mcp", "add", "-s", "user", server.name, "--transport", "stdio", "--", ...parts];
      })();

  // Wire bearer auth via `--header` for HTTP servers with a declared
  // env var. claude mcp add does NOT interpolate ${VAR} at runtime — the
  // header value is stored verbatim — so we expand the env var here.
  // Without this step, claude.json gets the URL but no Authorization,
  // and doctor flags `wiring:missing[claude-code]` even after install.
  if (server.transport === "http" && server.auth_env_vars.length === 1) {
    const envVar = server.auth_env_vars[0]!;
    const token = process.env[envVar];
    if (token) {
      args.push("--header", `Authorization: Bearer ${token}`);
    }
  }
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

/** Push registry-owned entries into each agent's native MCP config. Idempotent.
 * Agents with native disabled-state support receive disabled servers too, so
 * their MCP UI can show "configured but disabled" instead of hiding them.
 */
export async function applyToAgents(name: string, opts: { dryRun?: boolean; agents?: readonly AgentId[] } = {}): Promise<void> {
  const reg = await loadRegistry();
  const server = reg.servers[name];
  if (!server) throw new Error(`mcp-registry: server '${name}' not registered`);
  const home = process.env["HOME"] ?? "";
  const dryRun = opts.dryRun ?? false;
  const targetAgents = opts.agents ?? ALL_AGENT_IDS;

  for (const agentId of targetAgents) {
    if (!server.agent_visibility[agentId]) continue;
    const enabled = isEnabled(server, agentId);
    if (!enabled && !supportsNativeDisabled(agentId)) continue;

    switch (agentId) {
      case "claude-code": await applyToClaudeCode(server, home, dryRun); break;
      case "codex":       if (await exists(`${home}/.codex`)) await applyToCodex(server, home, enabled); else console.log(`     · Codex not detected`); break;
      case "gemini":      if (await exists(`${home}/.gemini`)) await applyToGemini(server, home, enabled); else console.log(`     · Gemini not detected`); break;
      case "opencode":    if (await exists(`${home}/.config/opencode`)) await applyToOpenCode(server, home, enabled); else console.log(`     · OpenCode not detected`); break;
      case "pi":          await applyToPi(server, home); break;
    }
  }
}

/** Undo applyToAgents — remove from every agent's native MCP config regardless of enabled state. */
export async function removeFromAgents(
  name: string,
  opts: { dryRun?: boolean; agents?: readonly AgentId[]; includeHidden?: boolean } = {},
): Promise<void> {
  const reg = await loadRegistry();
  const server = reg.servers[name];
  if (!server) return; // already gone
  const home = process.env["HOME"] ?? "";
  const dryRun = opts.dryRun ?? false;
  const includeHidden = opts.includeHidden ?? false;
  const targetAgents = opts.agents ?? ALL_AGENT_IDS;

  for (const agentId of targetAgents) {
    if (!includeHidden && !server.agent_visibility[agentId]) continue;
    switch (agentId) {
      case "claude-code": await removeFromClaudeCode(server, home, dryRun); break;
      case "codex":       if (await exists(`${home}/.codex`)) await removeFromCodex(server, home); break;
      case "gemini":      if (await exists(`${home}/.gemini`)) await removeFromGemini(server, home); break;
      case "opencode":    if (await exists(`${home}/.config/opencode`)) await removeFromOpenCode(server, home); break;
      case "pi":          if (await exists(`${home}/.pi/agent`)) await removeFromPi(server, home); break;
    }
  }
}

/** Apply a disabled registry state to agent config.
 *
 * Agents with native disabled-state support keep the server configured but off.
 * Agents without safe disabled config get the server removed from native config
 * while the registry still records it as disabled.
 */
export async function applyDisabledToAgents(
  name: string,
  opts: { dryRun?: boolean; agents?: readonly AgentId[] } = {},
): Promise<void> {
  const reg = await loadRegistry();
  const server = reg.servers[name];
  if (!server) return;

  const targetAgents = opts.agents ?? ALL_AGENT_IDS;
  const nativeDisabledAgents = targetAgents.filter((agentId) =>
    disabledConfigSupport(server, agentId) === "native"
  );
  const removeOnlyAgents = targetAgents.filter((agentId) =>
    disabledConfigSupport(server, agentId) === "disabledConfigUnsupported"
  );

  if (removeOnlyAgents.length > 0) {
    await removeFromAgents(name, { agents: removeOnlyAgents, dryRun: opts.dryRun });
  }
  if (nativeDisabledAgents.length > 0) {
    await applyToAgents(name, { agents: nativeDisabledAgents, dryRun: opts.dryRun });
  }
}

// ── default servers (re-exported from mcp-builtins for backward compat) ───

export { DEFAULT_GITHUB_SERVER } from "./mcp-builtins.ts";
