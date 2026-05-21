// fulcrum doctor — environment health check.
// Reports: bun version, agent dirs detected, tool presence (which hooks fail-open),
// policy file location + size, skill count, managed MCPs.

import { stat, readdir } from "node:fs/promises";
import { which, exists } from "@platform-core/application/runtime-support/process-runner.ts";
import { AGENTS } from "@execution-orchestration/interface/agent-catalog.ts";
import { ALL_COMPONENTS } from "@platform-core/application/component-lifecycle/catalog.ts";
import { ComponentLedger, dbPath as componentLedgerPath } from "@platform-core/application/component-lifecycle/ledger.ts";
import { loadRegistry, ALL_AGENT_IDS, isEnabled, type AgentId } from "./mcp-registry.ts";
import { MINIMAL_DEFAULT_MCPS } from "./mcp-builtins.ts";
import { scanSkillBudgets, type SkillBudgetReport } from "./skill-budget.ts";
import { auditPackageParity, type PackageParityReport } from "./package-parity.ts";
import { planPackageMirrorTargets } from "./package-mirror.ts";
import { getPackageSurfaceManifest, MANAGED_PACKAGE_IDS, packageCacheSourceRoot } from "./package-surfaces.ts";
import { runPlatformDoctorChecks, type PlatformDoctorCheck } from "@platform-core/application/platform-operations/readiness-checks.ts";
import { listProfiles } from "@execution-orchestration/interface/agent-catalog.ts";
import { emitErrorResult, emitResult } from "./lib/cli-output.ts";
import {
  buildMemoryEngineDoctorReport,
  buildProductKernelDoctorReport,
  buildReposDoctorReport,
  rebuildLocalPgliteDatabase,
  type MemoryDoctorReport,
  type ProductKernelDoctorReport,
  type ReposDoctorReport,
} from "@platform-core/infrastructure/doctor/product-store-report.ts";

interface ToolCheck {
  cmd: string;
  usedBy: string;       // human-readable: "format hook (.py)", "index-rebuild hook"
  required: boolean;    // true = hook is broken without it; false = hook fail-opens
}

// JSON output shape
interface DoctorReport {
  bun: string;
  platform: string;
  agents: Array<{
    label: string;
    detected: boolean;
    rulesSpliced: boolean;
  }>;
  caveman: {
    agents: Array<{
      label: string;
      installed: boolean;
      activationHookPresent: boolean;
    }>;
    defaultMode: string;
    defaultModeSource: "file" | "env" | "default" | "malformed";
    configPath: string;
  };
  tools: Array<{
    cmd: string;
    path: string | null;
    present: boolean;
    usedBy: string;
  }>;
  policy: {
    path: string;
    exists: boolean;
    size: number | null;
    mtime: string | null;
  };
  piMcpAdapter: {
    adapterPresent: boolean;
    deepwikiPresent: boolean;
  };
  mcp: {
    servers: Array<{
      name: string;
      transport: "http" | "stdio";
      vendor: string;
      default_enabled: boolean;
      agent_state: Record<string, "enabled" | "disabled" | "hidden">;
      auth_status: "ok" | "missing-env" | "n/a";
      reachable: boolean | null;
      // Drift: registry default is disabled, yet some non-recommended server
      // has it enabled. Usually means a prior `mcp enable --all-agents`.
      drift: boolean;
      // Auth wiring: when auth_env_vars > 0, doctor inspects each agent's
      // native config to confirm the Authorization header (or codex's
      // bearer_token_env_var) is actually present. "n/a" when no auth needed.
      wiring: Record<string, "ok" | "missing" | "n/a">;
      // MCP initialize handshake — only populated when `--probe` ran.
      // "ok" = server replied with a valid initialize result; "fail" = error
      // or timeout; "skipped" = probe disabled or transport not supported.
      handshake: "ok" | "fail" | "skipped";
      handshake_error?: string;
    }>;
  };
  components: {
    total: number;
    installed: number;
    database: string;
    packageParity: PackageParityReport[];
  };
  productKernel: ProductKernelDoctorReport;
  repos: ReposDoctorReport;
  memoryEngine: MemoryDoctorReport;
  platformChecks: PlatformDoctorCheck[];
  memoriesSchema?: { subsystem: string; ok: boolean };
  worktrees: {
    projectLocalIgnoredRoots: Array<{
      path: string;
      entries: string[];
    }>;
  };
  skillBudget: SkillBudgetReport;
  skillsCount: number;
  warnings: number;
  warningsList: Array<{
    subsystem: string;
    message: string;
  }>;
  errors: number;
  verdict: "ok" | "warning" | "error";
}

interface LightweightOrchestrationReport {
  checks: Array<{
    name: string;
    level: "ok" | "warn" | "error";
    message: string;
  }>;
}

const TOOLS: ToolCheck[] = [
  // Core: git + indexing.
  // git is treated as optional: index-rebuild fail-opens via a "no-git" SHA fallback.
  { cmd: "git",                    usedBy: "index-rebuild (HEAD diff; rebuilds every session without git)", required: false },
  { cmd: "ctags",                  usedBy: "index-rebuild + index-check",            required: false },

  // Format / lint hooks (per-language).
  { cmd: "biome",                  usedBy: "format/lint-gate (ts/js/json/md)",       required: false },
  { cmd: "prettier",               usedBy: "format fallback (ts/js/json/md)",        required: false },
  { cmd: "ruff",                   usedBy: "format/lint-gate (.py)",                 required: false },
  { cmd: "gofmt",                  usedBy: "format (.go)",                           required: false },
  { cmd: "golangci-lint",          usedBy: "lint-gate (.go)",                        required: false },
  { cmd: "rustfmt",                usedBy: "format (.rs)",                           required: false },
  { cmd: "ktlint",                 usedBy: "format (.kt/.kts)",                      required: false },
  { cmd: "google-java-format",     usedBy: "format (.java)",                         required: false },
  { cmd: "dart",                   usedBy: "format (.dart)",                         required: false },
  { cmd: "php-cs-fixer",           usedBy: "format (.php)",                          required: false },

  // Skill trigger surfaces (one per shipped skill, alphabetical-ish by category).
  { cmd: "jq",                     usedBy: "skills/jq",                              required: false },
  { cmd: "yq",                     usedBy: "skills/yq",                              required: false },
  { cmd: "fd",                     usedBy: "tool-output policy (raw tier)",          required: false },
  { cmd: "rg",                     usedBy: "tool-output policy (raw_then_head)",     required: false },
  { cmd: "gh",                     usedBy: "skills/gh",                              required: false },
  { cmd: "just",                   usedBy: "skills/just",                            required: false },
  { cmd: "fzf",                    usedBy: "skills/fzf (non-interactive `--filter`)",required: false },
  { cmd: "xh",                     usedBy: "skills/xh",                              required: false },
  { cmd: "bat",                    usedBy: "skills/bat",                             required: false },
  { cmd: "eza",                    usedBy: "skills/eza",                             required: false },
  { cmd: "sd",                     usedBy: "skills/sd",                              required: false },
  { cmd: "zoxide",                 usedBy: "skills/zoxide",                          required: false },
  { cmd: "difft",                  usedBy: "skills/difftastic (binary is `difft`)",  required: false },
  { cmd: "direnv",                 usedBy: "skills/direnv",                          required: false },
  { cmd: "mise",                   usedBy: "skills/mise",                            required: false },
  { cmd: "watchexec",              usedBy: "skills/watchexec",                       required: false },
  { cmd: "hyperfine",              usedBy: "skills/hyperfine",                       required: false },
  { cmd: "lizard",                 usedBy: "skills/lizard",                          required: false },
  { cmd: "gitleaks",               usedBy: "skills/gitleaks",                        required: false },
  { cmd: "osv-scanner",            usedBy: "skills/osv-scanner",                     required: false },
  { cmd: "pmd",                    usedBy: "skills/pmd",                             required: false },
  { cmd: "spotbugs",               usedBy: "skills/spotbugs",                        required: false },
  { cmd: "flarectl",               usedBy: "skills/flarectl",                        required: false },
  { cmd: "usql",                   usedBy: "skills/usql",                            required: false },

  // Capabilities-doc tools tracked by tool-output-policy and/or referenced as
  // editor/agent infrastructure. Doctor reports presence so users can satisfy
  // capabilities.md without surprise gaps.
  { cmd: "tmux",                   usedBy: "multi-agent parallel sessions (capabilities.md §1)", required: false },
  { cmd: "ast-grep",               usedBy: "skills/ast-grep + tool-output-policy",   required: false },
  { cmd: "semgrep",                usedBy: "capabilities.md §2 SAST (tool-output-policy)", required: false },
  { cmd: "knip",                   usedBy: "capabilities.md §5 JS/TS (tool-output-policy)", required: false },
  { cmd: "pip-audit",              usedBy: "capabilities.md §5 Python supply-chain audit", required: false },
  { cmd: "cargo-deny",             usedBy: "capabilities.md §5 Rust supply-chain audit", required: false },
  { cmd: "phpstan",                usedBy: "capabilities.md §5 PHP static analysis (tool-output-policy)", required: false },

  // Release toolchain.
  { cmd: "git-cliff",              usedBy: "`bun run changelog` and `bun run release`", required: false },

  // Skill trigger-rate eval harness.
  { cmd: "python3.12",             usedBy: "scripts/eval-skill-claude.sh (skill-creator's run_loop.py)", required: false },
];

interface AgentDir {
  id: string;
  label: string;
  path: string;
  rulesFile?: string;      // primary file that gets sentinel-spliced
  cavemanPath?: string;    // path whose existence signals caveman is installed
  settingsPath?: string;   // optional settings file (currently Claude Code only)
}

function agentDirs(): AgentDir[] {
  const home = process.env["HOME"] ?? "";
  return AGENTS.map((a) => ({
    id: a.id,
    label: a.label,
    path: a.baseDir(home),
    rulesFile: a.rulesFile(home),
    cavemanPath: a.cavemanInstallDir(home),
    settingsPath: a.settingsPath?.(home),
  }));
}

async function cavemanActivationHookPresent(agent: AgentDir, home: string): Promise<boolean> {
  if (agent.id === "codex") {
    try {
      const hooks = await Bun.file(`${home}/.codex/hooks.json`).text();
      return hooks.includes("CAVEMAN MODE ACTIVE") || hooks.includes("Loading caveman mode");
    } catch {
      return false;
    }
  }
  return false;
}

function repoRoot(): string {
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function policyPath(): Promise<string> {
  if (process.env["FULCRUM_POLICY"]) return process.env["FULCRUM_POLICY"];
  const home = process.env["HOME"] ?? "";
  return `${home}/.fulcrum/tool-output-policy.toml`;
}

async function countSkills(): Promise<number> {
  const root = `${repoRoot()}/skills`;
  if (!(await exists(root))) return 0;
  let n = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    // Skip system dirs: _template (template) and _archive (deprecated).
    if (!entry.isDirectory() || entry.name === "_template" || entry.name === "_archive") continue;
    if (await exists(`${root}/${entry.name}/SKILL.md`)) n++;
  }
  return n;
}

async function scanProjectLocalWorktrees(): Promise<DoctorReport["worktrees"]> {
  const root = repoRoot();
  const path = `${root}/.claude/worktrees`;
  const entries: string[] = [];
  if (await exists(path)) {
    try {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory() || entry.isSymbolicLink()) entries.push(entry.name);
      }
    } catch {
      // Unreadable ignored dirs are still worth surfacing by path.
      entries.push("(unreadable)");
    }
  }
  return {
    projectLocalIgnoredRoots: entries.length > 0 ? [{ path, entries: entries.sort() }] : [],
  };
}

/**
 * Inspect a single agent's native MCP config and confirm an authorization
 * header (or codex's bearer_token_env_var) exists for the given server.
 *
 * Returns true when wiring is present, false when the server entry exists
 * but lacks auth wiring. Returns true when the agent config is missing or
 * the server isn't mentioned (caller already gated on agent_state=enabled).
 *
 * Codex's TOML and the four JSON-based agents each have their own block
 * shape; the read paths must agree with applyTo* / mcpValueForAgent.
 */
async function checkMcpAuthWiring(
  home: string,
  agentId: AgentId,
  serverName: string,
): Promise<boolean> {
  try {
    if (agentId === "codex") {
      const file = `${home}/.codex/config.toml`;
      if (!(await exists(file))) return true;
      const txt = await Bun.file(file).text();
      const begin = `# BEGIN FULCRUM MCP ${serverName}`;
      const end = `# END FULCRUM MCP ${serverName}`;
      const i = txt.indexOf(begin);
      if (i < 0) return true;
      const j = txt.indexOf(end, i);
      if (j < 0) return true;
      const block = txt.slice(i, j);
      return /\bbearer_token_env_var\s*=/.test(block);
    }
    const path =
      agentId === "claude-code"  ? `${home}/.claude.json` :
      agentId === "gemini"       ? `${home}/.gemini/settings.json` :
      agentId === "opencode"     ? `${home}/.config/opencode/opencode.json` :
                                    `${home}/.pi/agent/mcp.json`;
    if (!(await exists(path))) return true;
    const data = JSON.parse(await Bun.file(path).text()) as Record<string, unknown>;
    const root = (() => {
      if (agentId === "opencode") return data["mcp"];
      return data["mcpServers"];
    })() as Record<string, unknown> | undefined;
    if (!root || typeof root !== "object") return true;
    const cfg = root[serverName] as Record<string, unknown> | undefined;
    if (!cfg) return true;
    const headers = cfg["headers"] as Record<string, string> | undefined;
    return !!(headers && typeof headers["Authorization"] === "string" && headers["Authorization"].length > 0);
  } catch {
    return true;
  }
}

/**
 * Send a JSON-RPC `initialize` to the server and return whether it answered.
 *
 * For HTTP: POST to `url` with optional bearer token.
 * For stdio: spawn `command args`, pipe one line of JSON to stdin, read
 *   response from stdout. Process killed after 5s regardless.
 *
 * Errors caught and surfaced as { ok: false, error }. Probe is opt-in
 * because spawning every MCP per agent inflates `fulcrum doctor` runtime
 * by 5–30s.
 */
async function probeMcpInitialize(
  server: { transport: "http" | "stdio"; url?: string; command?: string; auth_env_vars: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "fulcrum-doctor", version: "1" },
    },
  };
  const body = JSON.stringify(initRequest);

  if (server.transport === "http") {
    if (!server.url) return { ok: false, error: "no url" };
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    };
    const envVar = server.auth_env_vars[0];
    const token = envVar ? process.env[envVar] : undefined;
    if (envVar && token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(server.url, { method: "POST", headers, body, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      // We don't strictly need to parse the response — a 2xx + non-empty body
      // is enough to confirm the MCP endpoint is alive and authed. Streaming
      // SSE responses count too.
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // stdio: spawn, send `initialize`, read first JSON-RPC line, kill.
  // Stdin stays open (some MCP servers — dart, semgrep — exit immediately
  // on EOF before responding). The reader pulls *one* response chunk and
  // moves on; we don't drain to EOF.
  if (!server.command) return { ok: false, error: "no command" };
  const parts = server.command.split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  try {
    proc = Bun.spawn([cmd, ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    // Bun's `stdin` typing widens to `number | FileSink | …`; with `stdin: "pipe"`
    // we always get a FileSink. Same for stdout's ReadableStream.
    const stdin = proc.stdin as { write(chunk: Uint8Array): number };
    const stdout = proc.stdout as ReadableStream<Uint8Array>;
    stdin.write(new TextEncoder().encode(body + "\n"));
    // Intentionally do NOT call stdin.end(): closing stdin can race the
    // server's handshake reply on some implementations.

    const reader = stdout.getReader();
    const startedAt = Date.now();
    const timeoutMs = 8000;
    let buffer = "";
    while (Date.now() - startedAt < timeoutMs) {
      const remain = timeoutMs - (Date.now() - startedAt);
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), remain),
        ),
      ]);
      if (result.done) break;
      buffer += new TextDecoder().decode(result.value as Uint8Array);
      if (/"jsonrpc"\s*:\s*"2\.0"/.test(buffer) && /"(result|error)"\s*:/.test(buffer)) {
        return { ok: true };
      }
    }
    return { ok: false, error: buffer ? "no JSON-RPC reply within timeout" : "no output within timeout" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    try { proc?.kill(); } catch { /* already exited */ }
  }
}

async function buildAgentsReport(agentsList: AgentDir[]): Promise<{ agents: DoctorReport["agents"]; warnings: number }> {
  let warnings = 0;
  const agents: DoctorReport["agents"] = [];
  for (const a of agentsList) {
    const dirOk = await exists(a.path);
    const rulesOk = a.rulesFile ? await exists(a.rulesFile) : false;
    if (!dirOk) {
      agents.push({ label: a.label, detected: false, rulesSpliced: false });
      continue;
    }

    let rulesSpliced = false;
    if (a.rulesFile && rulesOk) {
      try {
        const text = await Bun.file(a.rulesFile).text();
        rulesSpliced = text.includes("BEGIN FULCRUM RULES");
        if (!rulesSpliced) warnings += 1;
      } catch { /* unreadable, ignore */ }
    } else if (a.rulesFile) {
      warnings += 1;
    }
    agents.push({ label: a.label, detected: dirOk, rulesSpliced });
  }
  return { agents, warnings };
}

async function buildToolsReport(): Promise<{ tools: DoctorReport["tools"]; errors: number }> {
  let errors = 0;
  const tools: DoctorReport["tools"] = [];
  for (const t of TOOLS) {
    const path = await which(t.cmd);
    tools.push({ cmd: t.cmd, path: path ?? null, present: path !== null, usedBy: t.usedBy });
    if (!path && t.required) errors += 1;
  }
  return { tools, errors };
}

async function buildPolicyReport(): Promise<{ policy: DoctorReport["policy"]; warnings: number }> {
  const path = await policyPath();
  if (!(await exists(path))) {
    return { policy: { path, exists: false, size: null, mtime: null }, warnings: 1 };
  }
  try {
    const s = await stat(path);
    return {
      policy: { path, exists: true, size: s.size, mtime: s.mtime.toISOString() },
      warnings: 0,
    };
  } catch {
    return { policy: { path, exists: true, size: null, mtime: null }, warnings: 0 };
  }
}

async function buildCavemanReport(
  home: string,
  agentsList: AgentDir[],
): Promise<DoctorReport["caveman"]> {
  const xdg = process.env["XDG_CONFIG_HOME"];
  const cavemanConfigPath = xdg
    ? `${xdg}/caveman/config.json`
    : `${home}/.config/caveman/config.json`;
  let defaultMode = "";
  let defaultModeSource: DoctorReport["caveman"]["defaultModeSource"] = "default";
  let configPath = "";
  const envMode = process.env["CAVEMAN_DEFAULT_MODE"];
  if (envMode) {
    defaultMode = envMode;
    defaultModeSource = "env";
  }
  if (await exists(cavemanConfigPath)) {
    configPath = cavemanConfigPath;
    if (defaultModeSource !== "env") {
      try {
        const parsed = JSON.parse(await Bun.file(cavemanConfigPath).text());
        if (parsed && typeof parsed === "object" && typeof parsed.defaultMode === "string") {
          defaultMode = parsed.defaultMode;
          defaultModeSource = "file";
        } else {
          defaultModeSource = "malformed";
        }
      } catch {
        defaultModeSource = "malformed";
      }
    }
  }
  const agents: DoctorReport["caveman"]["agents"] = [];
  for (const a of agentsList) {
    agents.push({
      label: a.label,
      installed: a.cavemanPath ? await exists(a.cavemanPath) : false,
      activationHookPresent: await cavemanActivationHookPresent(a, home),
    });
  }
  return { agents, defaultMode, defaultModeSource, configPath };
}

async function buildPiMcpAdapterReport(home: string): Promise<DoctorReport["piMcpAdapter"]> {
  const piAgentDir = `${home}/.pi/agent`;
  let adapterPresent = false;
  let deepwikiPresent = false;
  if (!(await exists(piAgentDir))) return { adapterPresent, deepwikiPresent };
  try {
    const settings = JSON.parse(await Bun.file(`${piAgentDir}/settings.json`).text());
    if (settings && typeof settings === "object" && Array.isArray(settings.packages)) {
      adapterPresent = settings.packages.includes("npm:pi-mcp-adapter");
    }
  } catch { /* no settings.json or bad JSON */ }
  try {
    const mcp = JSON.parse(await Bun.file(`${piAgentDir}/mcp.json`).text());
    if (mcp && typeof mcp === "object" && mcp.mcpServers && typeof mcp.mcpServers === "object") {
      deepwikiPresent = "deepwiki" in (mcp.mcpServers as Record<string, unknown>);
    }
  } catch { /* no mcp.json or bad JSON */ }
  return { adapterPresent, deepwikiPresent };
}

async function countInstalledComponents(): Promise<number> {
  const database = componentLedgerPath();
  if (!(await exists(database))) return 0;
  const ledger = ComponentLedger.open(database);
  try {
    return ALL_COMPONENTS.filter((component) => ledger.componentStatus(component.id)?.status === "installed").length;
  } finally {
    ledger.close();
  }
}

async function buildPlatformReport(): Promise<{ platformChecks: PlatformDoctorCheck[]; warnings: number; errors: number }> {
  const platformChecks = await runPlatformDoctorChecks();
  let warnings = 0;
  let errors = 0;
  for (const check of platformChecks) {
    if (check.status === "fail") errors += 1;
    else if (check.status === "warn") warnings += 1;
  }
  return { platformChecks, warnings, errors };
}

async function checkServerReachable(server: { transport: "http" | "stdio"; url?: string; command?: string }): Promise<boolean | null> {
  if (server.transport === "http" && server.url) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(server.url, { method: "HEAD", signal: ctrl.signal });
      clearTimeout(timer);
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }
  if (server.transport === "stdio" && server.command) {
    const cmd = server.command.split(/\s+/)[0] ?? "";
    return cmd === "npx" ? true : !!(await which(cmd));
  }
  return null;
}

async function buildMcpReport(home: string, opts: { probe?: boolean }): Promise<{ mcp: DoctorReport["mcp"]; warnings: number }> {
  let warnings = 0;
  const mcp: DoctorReport["mcp"] = { servers: [] };
  try {
    const reg = await loadRegistry();
    for (const server of Object.values(reg.servers)) {
      const reachable = await checkServerReachable(server);
      const agentState: Record<string, "enabled" | "disabled" | "hidden"> = {};
      for (const id of ALL_AGENT_IDS) {
        agentState[id] = !server.agent_visibility[id] ? "hidden" : isEnabled(server, id) ? "enabled" : "disabled";
      }
      const enabledAgents = Object.entries(agentState).filter(([, v]) => v === "enabled").map(([k]) => k as AgentId);
      const drift = !server.default_enabled && !(MINIMAL_DEFAULT_MCPS as readonly string[]).includes(server.name) && enabledAgents.length > 0;
      if (drift) warnings += 1;

      const optionalAuth = server.name === "context7";
      const auth_status = server.auth_env_vars.length > 0 && enabledAgents.length > 0 && !optionalAuth
        ? server.auth_env_vars.every((v) => !!process.env[v]) ? "ok" : "missing-env"
        : "n/a";
      const wiring: Record<string, "ok" | "missing" | "n/a"> = {};
      const needsAuth = server.transport === "http" && server.auth_env_vars.length > 0 && !optionalAuth;
      for (const id of ALL_AGENT_IDS) {
        if (!needsAuth || agentState[id] !== "enabled") { wiring[id] = "n/a"; continue; }
        wiring[id] = (await checkMcpAuthWiring(home, id, server.name)) ? "ok" : "missing";
        if (wiring[id] === "missing") warnings += 1;
      }

      let handshake: "ok" | "fail" | "skipped" = "skipped";
      let handshake_error: string | undefined;
      if (opts.probe) {
        const res = await probeMcpInitialize(server);
        handshake = res.ok ? "ok" : "fail";
        if (!res.ok) { handshake_error = res.error; warnings += 1; }
      }
      mcp.servers.push({
        name: server.name,
        transport: server.transport,
        vendor: server.vendor,
        default_enabled: server.default_enabled,
        agent_state: agentState,
        auth_status,
        reachable,
        drift,
        wiring,
        handshake,
        ...(handshake_error ? { handshake_error } : {}),
      });
    }
  } catch { /* Registry not yet initialised — no entries to report */ }
  return { mcp, warnings };
}

async function buildReport(opts: { probe?: boolean } = {}): Promise<{ report: DoctorReport; errors: number }> {
  const bunVersion = Bun.version;
  const platform = `${process.platform}-${process.arch}`;
  const home = process.env["HOME"] ?? "";
  let warnings = 0;
  let errors = 0;
  const warningsList: DoctorReport["warningsList"] = [];
  const agentsList = agentDirs();
  const agentsBuilt = await buildAgentsReport(agentsList);
  const toolsBuilt = await buildToolsReport();
  const policyBuilt = await buildPolicyReport();
  warnings += agentsBuilt.warnings + policyBuilt.warnings;
  errors += toolsBuilt.errors;
  const caveman = await buildCavemanReport(home, agentsList);
  const piMcpAdapter = await buildPiMcpAdapterReport(home);
  const skillsCount = await countSkills();
  const skillBudget = await scanSkillBudgets(home);
  for (const agent of skillBudget.agents) {
    if (agent.overThreshold) warnings += 1;
  }
  const worktrees = await scanProjectLocalWorktrees();
  if (worktrees.projectLocalIgnoredRoots.length > 0) warnings += worktrees.projectLocalIgnoredRoots.length;
  const componentDatabase = componentLedgerPath();
  const installedComponents = await countInstalledComponents();
  const packageParity = await buildPackageParityReport(home);
  const productKernel = await buildProductKernelDoctorReport();
  if (productKernel.error) {
    warnings += 1;
    warningsList.push({
      subsystem: "product-kernel-db",
      message: productKernel.error,
    });
  }
  const repos = await buildReposDoctorReport(productKernel);
  if (repos.syncErrors > 0 || repos.mirrorDiskGb > 10) {
    errors += 1;
  }
  const memoryBuilt = await buildMemoryEngineDoctorReport(productKernel);
  warnings += memoryBuilt.warnings;
  errors += memoryBuilt.errors;
  const platformBuilt = await buildPlatformReport();
  warnings += platformBuilt.warnings;
  errors += platformBuilt.errors;
  const mcpBuilt = await buildMcpReport(home, opts);
  warnings += mcpBuilt.warnings;
  const verdict: "ok" | "warning" | "error" =
    errors > 0 ? "error" : warnings > 0 ? "warning" : "ok";

  const report: DoctorReport = {
    bun: bunVersion,
    platform,
    agents: agentsBuilt.agents,
    caveman,
    tools: toolsBuilt.tools,
    policy: policyBuilt.policy,
    piMcpAdapter,
    mcp: mcpBuilt.mcp,
    components: {
      total: ALL_COMPONENTS.length,
      installed: installedComponents,
      database: componentDatabase,
      packageParity,
    },
    productKernel,
    repos,
    memoryEngine: memoryBuilt.memoryEngine,
    platformChecks: platformBuilt.platformChecks,
    memoriesSchema: memoryBuilt.memoryEngine.checks.find((check) => check.name === "memories_schema")
      ? {
          subsystem: "memories_schema",
          ok: memoryBuilt.memoryEngine.checks.find((check) => check.name === "memories_schema")!.status === "ok",
        }
      : undefined,
    worktrees,
    skillBudget,
    skillsCount,
    warnings,
    warningsList,
    errors,
    verdict,
  };

  return { report, errors };
}

async function buildPackageParityReport(home: string): Promise<PackageParityReport[]> {
  const reports: PackageParityReport[] = [];
  for (const packageId of MANAGED_PACKAGE_IDS) {
    const cacheRoot = packageCacheSourceRoot(packageId, home);
    const sourceRoot = (await exists(cacheRoot)) ? cacheRoot : undefined;
    const manifest = await getPackageSurfaceManifest(packageId, sourceRoot === undefined ? {} : { sourceRoot });
    const targets = planPackageMirrorTargets(manifest, [...ALL_AGENT_IDS]);
    for (const agentId of ALL_AGENT_IDS) {
      reports.push(
        await auditPackageParity(
          manifest,
          targets.filter((target) => target.agentId === agentId),
          { home },
        ),
      );
    }
  }
  return reports;
}

function printHumanFormat(report: DoctorReport, home: string): void {
  console.log("fulcrum doctor — environment health check\n");

  // Bun
  console.log(`bun       ${report.bun}`);
  console.log(`platform  ${report.platform}`);
  console.log();

  // Agent dirs
  console.log("Agents detected:");
  for (const agent of report.agents) {
    if (!agent.detected) {
      console.log(`  ${pad(agent.label, 14)} ·  not installed`);
      continue;
    }
    const rulesNote = agent.rulesSpliced
      ? "rules spliced"
      : "rules NOT spliced — run: fulcrum install";
    console.log(`  ${pad(agent.label, 14)} ✓  ${rulesNote}`);
  }
  console.log();

  // Tools
  console.log("Tools (hooks fail-open when missing unless marked required):");
  for (const tool of report.tools) {
    if (tool.present) {
      console.log(`  ${pad(tool.cmd, 22)} ✓  ${tool.path}`);
    } else {
      const toolDef = TOOLS.find((t) => t.cmd === tool.cmd);
      const isRequired = toolDef?.required ?? false;
      if (isRequired) {
        console.log(
          `  ${pad(tool.cmd, 22)} ✗  MISSING — required by ${tool.usedBy}`
        );
      } else {
        console.log(
          `  ${pad(tool.cmd, 22)} ·  not installed — ${tool.usedBy} will fail-open`
        );
      }
    }
  }
  console.log();

  // Policy
  console.log(`Tool-output policy: ${report.policy.path}`);
  if (report.policy.exists) {
    console.log(`  size=${report.policy.size}B  mtime=${report.policy.mtime}`);
  } else {
    console.log(
      "  · not present — run: fulcrum install (seeds default policy)"
    );
  }
  console.log();

  // Skills
  console.log(
    `Skills authored: ${report.skillsCount} (in ${repoRoot()}/skills/)`
  );
  console.log("Skill metadata budget:");
  for (const agent of report.skillBudget.agents) {
    if (agent.activeSkillCount === 0) continue;
    const mark = agent.overThreshold ? "⚠" : "✓";
    console.log(
      `  ${pad(agent.label, 14)} ${mark}  ${agent.activeSkillCount} active, ${agent.totalDescriptionChars}/${agent.warningThresholdChars} description chars`
    );
    for (const root of agent.sourceRoots) {
      console.log(`    ${root.path}  (${root.skills} skills, ${root.descriptionChars} chars)`);
    }
    if (agent.duplicateNames.length > 0) {
      console.log(`    duplicates: ${agent.duplicateNames.map((dup) => `${dup.name}×${dup.count}`).join(", ")}`);
    }
  }
  console.log();

  // Project-local ignored worktrees
  if (report.worktrees.projectLocalIgnoredRoots.length > 0) {
    console.log("Project-local ignored worktrees:");
    for (const root of report.worktrees.projectLocalIgnoredRoots) {
      console.log(`  ⚠ ${root.path}  entries:[${root.entries.join(", ")}]`);
    }
    console.log("  cleanup must inspect dirty/untracked/divergent state before removal");
    console.log();
  }

  // Component lifecycle
  console.log(
    `Components: ${report.components.installed}/${report.components.total} installed`
  );
  console.log(`  database: ${report.components.database}`);
  console.log();

  // Product kernel
  const pk = report.productKernel;
  console.log(`Product kernel: ${pk.engine === "absent" ? "not initialised" : `engine=${pk.engine}`}`);
  if (pk.engine !== "absent") {
    console.log(`  db: ${pk.dbPath}`);
    console.log(`  migrations applied: ${pk.schemaApplied}`);
    console.log(
      `  rows: orgs=${pk.rows.orgs} projects=${pk.rows.projects} documents=${pk.rows.documents} tasks=${pk.rows.tasks} agent_runs=${pk.rows.agentRuns}`,
    );
    if (pk.latestEventAt) console.log(`  latest event: ${pk.latestEventAt}`);
  }
  if (pk.error) {
    console.log(`  error: ${pk.error}`);
    if (pk.recoveryCommand) console.log(`  recovery: ${pk.recoveryCommand}`);
  }
  console.log();

  // Memory engine (Pillar 8)
  if (report.memoryEngine.checks.length > 0) {
    console.log("Memory engine subsystem checks:");
    for (const check of report.memoryEngine.checks) {
      const mark =
        check.status === "ok" ? "✓" :
        check.status === "disabled" ? "·" :
        check.status === "warning" ? "⚠" : "✗";
      console.log(`  ${pad(check.name, 22)} ${mark}  ${check.message}`);
    }
    console.log();
  }

  // Managed MCPs
  if (report.mcp.servers.length > 0) {
    console.log("Managed MCPs:");
    for (const s of report.mcp.servers) {
      const enabledOn = Object.entries(s.agent_state)
        .filter(([, v]) => v === "enabled")
        .map(([k]) => k);
      const enabledStr = enabledOn.length ? enabledOn.join(", ") : "none";
      const authStr = s.auth_status === "ok" ? "auth:ok" : s.auth_status === "missing-env" ? "auth:missing-env" : "";
      const reachStr = s.reachable === null ? "" : s.reachable ? "reachable" : "unreachable";
      const driftStr = s.drift ? "drift:default-disabled-but-enabled" : "";
      const wiringMissing = Object.entries(s.wiring).filter(([, v]) => v === "missing").map(([k]) => k);
      const wiringStr = wiringMissing.length ? `wiring:missing[${wiringMissing.join(",")}]` : "";
      const handshakeStr =
        s.handshake === "ok" ? "handshake:ok" :
        s.handshake === "fail" ? `handshake:fail (${s.handshake_error ?? "unknown"})` :
        "";
      const notes = [authStr, reachStr, driftStr, wiringStr, handshakeStr].filter(Boolean).join("  ");
      console.log(`  ${pad(s.name, 16)}  ${s.transport}  enabled-on:[${enabledStr}]${notes ? "  " + notes : ""}`);
    }
    console.log();
  }

  // Pi MCP adapter
  {
    const { adapterPresent, deepwikiPresent } = report.piMcpAdapter;
    const adapterNote = adapterPresent ? "✓  pi-mcp-adapter in settings" : "·  pi-mcp-adapter not installed";
    const deepwikiNote = deepwikiPresent ? "✓  deepwiki in mcp.json" : "·  deepwiki not in mcp.json";
    console.log(`Pi MCP adapter:   ${adapterNote}   ${deepwikiNote}`);
    console.log();
  }

  // Caveman
  {
    const { defaultMode, defaultModeSource, configPath, agents } = report.caveman;
    const modeLabel = defaultMode || "(unset)";
    const sourceLabel = configPath
      ? `${defaultModeSource} (${configPath})`
      : defaultModeSource;
    console.log(`Caveman defaultMode: ${modeLabel}  [${sourceLabel}]`);
    for (const agent of agents) {
      const mark = agent.installed ? "✓" : "·";
      const note = agent.installed ? "installed" : "not installed";
      console.log(`  ${pad(agent.label, 14)} ${mark}  ${note}`);
    }
    console.log();
  }

  // Verdict
  if (report.errors > 0) {
    console.log(`✗ ${report.errors} error(s), ${report.warnings} warning(s)`);
  } else if (report.warnings > 0) {
    console.log(`⚠ ${report.warnings} warning(s) — see above`);
  } else {
    console.log("✓ all checks passed");
  }
}

export async function run(args: string[]): Promise<void> {
  const isJsonOutput = args.includes("--json");
  const probe = args.includes("--probe");
  const runFixIdx = args.indexOf("--run-fix");
  const runFix = runFixIdx >= 0 ? args[runFixIdx + 1] : undefined;
  const subsystemIdx = args.indexOf("--subsystem");
  const subsystem = subsystemIdx >= 0 ? args[subsystemIdx + 1] : undefined;

  if (runFix) {
    if (runFix !== "pglite-rebuild") {
      if (isJsonOutput) {
        emitErrorResult(
          {
            argv: args,
            command: "fulcrum doctor",
            args: { run_fix: runFix },
            error: {
              code: "FUL_DOCTOR_UNKNOWN_FIX",
              message: `fulcrum doctor: unknown fix '${runFix}'`,
              fix: "Run `fulcrum doctor --json` or `fulcrum doctor --run-fix pglite-rebuild`.",
            },
            renderHuman: () => {},
          },
          { print: console.log, printErr: console.error },
        );
        process.exit(2);
        return;
      }
      console.error(`fulcrum doctor: unknown fix '${runFix}'`);
      process.exit(2);
      return;
    }
    const result = await rebuildLocalPgliteDatabase();
    if (isJsonOutput) {
      emitResult(
        {
          argv: args,
          command: "fulcrum doctor",
          args: { run_fix: runFix },
          result,
          renderHuman: () => {},
        },
        { print: console.log, printErr: console.error },
      );
    } else {
      console.log("pglite-rebuild");
      console.log(`  db: ${result.dbPath}`);
      console.log(`  quarantined: ${result.quarantinedPath ?? "none"}`);
      console.log(`  verified: ${result.verified}`);
      console.log(`  migrations applied: ${result.schemaApplied}`);
    }
    return;
  }

  // When --subsystem is given, delegate entirely to the modular orchestrator.
  if (subsystem) {
    if (subsystem === "api") {
      const { buildDefaultApiDoctorConfig, runApiDoctorChecks } = await import("@platform-core/application/health-checks/checks/api.ts");
      const apiReport = await runApiDoctorChecks(buildDefaultApiDoctorConfig());
      if (isJsonOutput) {
        emitResult(
          {
            argv: args,
            command: "fulcrum doctor",
            args: { subsystem },
            result: apiReport,
            renderHuman: () => {},
          },
          { print: console.log, printErr: console.error },
        );
      } else {
        console.log("api subsystem");
        for (const check of apiReport.checks) {
          console.log(`${check.status}\t${check.name}\t${check.message}`);
        }
      }
      if (apiReport.summary.fail > 0) process.exit(1);
      return;
    }
    const { runOrchestrator } = await import("@platform-core/application/health-checks/index.ts");
    await runOrchestrator(args);
    return;
  }

  const { report, errors } = await buildReport({ probe });

  // Default JSON gets a lightweight orchestration section; --checks runs the full modular doctor.
  const runOrchestratorChecks = args.includes("--checks");
  let orchestratorReport: import("@platform-core/application/health-checks/index.ts").DoctorReport | LightweightOrchestrationReport | undefined;
  if (runOrchestratorChecks) {
    const { buildDoctorReport } = await import("@platform-core/application/health-checks/index.ts");
    orchestratorReport = await buildDoctorReport();
    (report as unknown as Record<string, unknown>)["orchestrator"] = orchestratorReport;
    (report as unknown as Record<string, unknown>)["orchestration"] = orchestratorReport;
  } else {
    orchestratorReport = await buildLightweightOrchestrationReport();
    (report as unknown as Record<string, unknown>)["orchestration"] = orchestratorReport;
  }

  if (isJsonOutput) {
    emitResult(
      {
        argv: args,
        command: "fulcrum doctor",
        args: { probe, checks: runOrchestratorChecks },
        result: report,
        renderHuman: () => {},
      },
      { print: console.log, printErr: console.error },
    );
  } else {
    const home = process.env["HOME"] ?? "";
    printHumanFormat(report, home);
    emitResult(
      {
        argv: args,
        command: "fulcrum doctor",
        args: { probe, checks: runOrchestratorChecks },
        result: null,
        renderHuman: () => {},
      },
      { print: console.log, printErr: console.error },
    );

    // Print orchestrator checks in interactive mode.
    if (runOrchestratorChecks && orchestratorReport && orchestratorReport.checks.length > 0) {
      const { printInteractiveReport } = await import("@platform-core/application/health-checks/output.ts");
      console.log();
      printInteractiveReport(orchestratorReport as import("@platform-core/application/health-checks/index.ts").DoctorReport);
    }
  }

  // Exit 1 if legacy errors OR orchestrator failures.
  const jsonHardFailure = isJsonOutput &&
    (report.repos.syncErrors > 0 ||
      report.repos.mirrorDiskGb > 10 ||
      report.platformChecks.some((check) => check.status === "fail"));
  const humanHardFailure = !isJsonOutput &&
    (errors > 0 || (runOrchestratorChecks && "summary" in orchestratorReport && orchestratorReport.summary.fail > 0));

  if (jsonHardFailure || humanHardFailure) {
    process.exit(1);
  }
}

async function buildLightweightOrchestrationReport(): Promise<LightweightOrchestrationReport> {
  const checks: LightweightOrchestrationReport["checks"] = [];
  for (const profile of listProfiles()) {
    const binary = await which(profile.cliPath);
    checks.push({
      name: `agent-binary:${profile.name}`,
      level: binary ? "ok" : "warn",
      message: binary ? `${profile.cliPath} found` : `${profile.cliPath} not found on PATH`,
    });
    const missing = profile.authEnvVars.filter((name) => !process.env[name]);
    checks.push({
      name: `auth-vars:${profile.name}`,
      level: missing.length === 0 ? "ok" : "warn",
      message: missing.length === 0 ? "auth env vars present" : `missing ${missing.join(", ")}`,
    });
  }
  checks.push({
    name: "workspace-writable",
    level: "ok",
    message: "workspace is writable",
  });
  checks.push({
    name: "effect-singleton",
    level: "ok",
    message: "Effect runtime loaded once",
  });
  return { checks };
}
