// fulcrum doctor — environment health check.
// Reports: bun version, agent dirs detected, tool presence (which hooks fail-open),
// policy file location + size, skill count, managed MCPs.

import { stat, readdir } from "node:fs/promises";
import { which, exists } from "../utils/proc.ts";
import { AGENTS } from "../agents/registry.ts";
import { ALL_COMPONENTS } from "../components/catalog.ts";
import { ComponentLedger, dbPath as componentLedgerPath } from "../components/ledger.ts";
import { loadRegistry, ALL_AGENT_IDS, isEnabled, type AgentId } from "./mcp-registry.ts";
import { MINIMAL_DEFAULT_MCPS } from "./mcp-builtins.ts";
import { scanSkillBudgets, type SkillBudgetReport } from "./skill-budget.ts";
import { auditPackageParity, type PackageParityReport } from "./package-parity.ts";
import { planPackageMirrorTargets } from "./package-mirror.ts";
import { getPackageSurfaceManifest, MANAGED_PACKAGE_IDS, packageCacheSourceRoot } from "./package-surfaces.ts";

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
  productKernel: {
    engine: "pglite" | "postgres" | "absent";
    dbPath: string;
    schemaApplied: number;
    rows: {
      orgs: number;
      projects: number;
      documents: number;
      tasks: number;
      agentRuns: number;
    };
    latestEventAt: string | null;
    error?: string;
  };
  memoriesSchema: {
    subsystem: "memories_schema";
    ok: boolean;
  };
  worktrees: {
    projectLocalIgnoredRoots: Array<{
      path: string;
      entries: string[];
    }>;
  };
  skillBudget: SkillBudgetReport;
  skillsCount: number;
  warnings: number;
  errors: number;
  verdict: "ok" | "warning" | "error";
}

const TOOLS: ToolCheck[] = [
  // Core: git + indexing.
  // git is treated as optional: index-rebuild fail-opens via a "no-git" SHA fallback.
  { cmd: "git",                    usedBy: "index-rebuild (HEAD diff; rebuilds every session without git)", required: false },
  { cmd: "ctags",                  usedBy: "index-rebuild + index-check",            required: false },
  { cmd: "graphify",               usedBy: "index-rebuild + index-check",            required: false },
  { cmd: "repomix",                usedBy: "index-rebuild (compress index)",         required: false },

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

async function buildReport(opts: { probe?: boolean } = {}): Promise<{ report: DoctorReport; errors: number }> {
  let warnings = 0;
  let errors = 0;

  // Bun and platform
  const bunVersion = Bun.version;
  const platform = `${process.platform}-${process.arch}`;

  // Agents
  const agentsList = agentDirs();
  const agentsReport: DoctorReport["agents"] = [];
  for (const a of agentsList) {
    const dirOk = await exists(a.path);
    const rulesOk = a.rulesFile ? await exists(a.rulesFile) : false;

    if (!dirOk) {
      agentsReport.push({
        label: a.label,
        detected: false,
        rulesSpliced: false,
      });
      continue;
    }

    let rulesSpliced = false;
    if (a.rulesFile && rulesOk) {
      try {
        const text = await Bun.file(a.rulesFile).text();
        rulesSpliced = text.includes("BEGIN FULCRUM RULES");
        if (!rulesSpliced) warnings++;
      } catch { /* unreadable, ignore */ }
    } else if (a.rulesFile) {
      warnings++;
    }

    agentsReport.push({
      label: a.label,
      detected: dirOk,
      rulesSpliced,
    });
  }

  // Tools
  const toolsReport: DoctorReport["tools"] = [];
  for (const t of TOOLS) {
    const path = await which(t.cmd);
    toolsReport.push({
      cmd: t.cmd,
      path: path ?? null,
      present: path !== null,
      usedBy: t.usedBy,
    });
    if (!path && t.required) {
      errors++;
    }
  }

  // Policy
  const policyFilePath = await policyPath();
  let policySize: number | null = null;
  let policyMtime: string | null = null;
  let policyExists = false;

  if (await exists(policyFilePath)) {
    policyExists = true;
    try {
      const s = await stat(policyFilePath);
      policySize = s.size;
      policyMtime = s.mtime.toISOString();
    } catch { /* ignore */ }
  } else {
    warnings++;
  }

  const policyReport: DoctorReport["policy"] = {
    path: policyFilePath,
    exists: policyExists,
    size: policySize,
    mtime: policyMtime,
  };

  // Caveman config + per-agent install detection.
  // defaultMode resolution: env CAVEMAN_DEFAULT_MODE wins, else config file,
  // else "" with source "default". Malformed JSON reported with source "malformed".
  const home = process.env["HOME"] ?? "";
  const xdg = process.env["XDG_CONFIG_HOME"];
  const cavemanConfigPath = xdg
    ? `${xdg}/caveman/config.json`
    : `${home}/.config/caveman/config.json`;
  let cavemanDefaultMode = "";
  let cavemanSource: "file" | "env" | "default" | "malformed" = "default";
  let cavemanConfigPathOut = "";
  const envMode = process.env["CAVEMAN_DEFAULT_MODE"];
  if (envMode) {
    cavemanDefaultMode = envMode;
    cavemanSource = "env";
  }
  if (await exists(cavemanConfigPath)) {
    cavemanConfigPathOut = cavemanConfigPath;
    if (cavemanSource !== "env") {
      try {
        const parsed = JSON.parse(await Bun.file(cavemanConfigPath).text());
        if (parsed && typeof parsed === "object" && typeof parsed.defaultMode === "string") {
          cavemanDefaultMode = parsed.defaultMode;
          cavemanSource = "file";
        } else {
          cavemanSource = "malformed";
        }
      } catch {
        cavemanSource = "malformed";
      }
    }
  }
  const cavemanAgents: DoctorReport["caveman"]["agents"] = [];
  for (const a of agentsList) {
    const installed = a.cavemanPath ? await exists(a.cavemanPath) : false;
    cavemanAgents.push({
      label: a.label,
      installed,
      activationHookPresent: await cavemanActivationHookPresent(a, home),
    });
  }

  // Pi MCP adapter check (informational; not a warning/error if absent)
  const piAgentDir = `${home}/.pi/agent`;
  let piAdapterPresent = false;
  let piDeepwikiPresent = false;
  if (await exists(piAgentDir)) {
    try {
      const settingsRaw = await Bun.file(`${piAgentDir}/settings.json`).text();
      const settings = JSON.parse(settingsRaw);
      if (settings && typeof settings === "object" && Array.isArray(settings.packages)) {
        piAdapterPresent = settings.packages.includes("npm:pi-mcp-adapter");
      }
    } catch { /* no settings.json or bad JSON */ }
    try {
      const mcpRaw = await Bun.file(`${piAgentDir}/mcp.json`).text();
      const mcp = JSON.parse(mcpRaw);
      if (mcp && typeof mcp === "object" && mcp.mcpServers && typeof mcp.mcpServers === "object") {
        piDeepwikiPresent = "deepwiki" in (mcp.mcpServers as Record<string, unknown>);
      }
    } catch { /* no mcp.json or bad JSON */ }
  }

  // Skills
  const skillsCount = await countSkills();
  const skillBudget = await scanSkillBudgets(home);
  for (const agent of skillBudget.agents) {
    if (agent.overThreshold) warnings += 1;
  }

  // Ignored project-local agent worktrees are easy to miss during release and
  // package hygiene checks because `.claude/` is ignored in this repo.
  const worktrees = await scanProjectLocalWorktrees();
  if (worktrees.projectLocalIgnoredRoots.length > 0) warnings += worktrees.projectLocalIgnoredRoots.length;

  // Component lifecycle ledger
  const componentDatabase = componentLedgerPath();
  let installedComponents = 0;
  if (await exists(componentDatabase)) {
    const ledger = ComponentLedger.open(componentDatabase);
    try {
      for (const component of ALL_COMPONENTS) {
        if (ledger.componentStatus(component.id)?.status === "installed") {
          installedComponents += 1;
        }
      }
    } finally {
      ledger.close();
    }
  }
  const packageParity = await buildPackageParityReport(home);
  const productKernel = await buildProductKernelReport();
  if (productKernel.error) {
    // A PGlite/Postgres failure means a key product surface is offline.
    // Surface it through the doctor verdict so users see "verdict: error"
    // instead of the previous silent "ok".
    errors += 1;
  }
  const memoriesSchema = await buildMemoriesSchemaReport();
  if (!memoriesSchema.ok) errors += 1;

  // Managed MCPs
  const mcpReport: DoctorReport["mcp"] = { servers: [] };
  try {
    const reg = await loadRegistry();
    for (const server of Object.values(reg.servers)) {
      // Reachability (HEAD probe for HTTP servers; which check for stdio)
      let reachable: boolean | null = null;
      if (server.transport === "http" && server.url) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          const res = await fetch(server.url, { method: "HEAD", signal: ctrl.signal });
          clearTimeout(timer);
          reachable = res.ok || res.status < 500;
        } catch {
          reachable = false;
        }
      } else if (server.transport === "stdio" && server.command) {
        const cmd = server.command.split(/\s+/)[0] ?? "";
        reachable = cmd === "npx" ? true : !!(await which(cmd));
      }

      const agentState: Record<string, "enabled" | "disabled" | "hidden"> = {};
      for (const id of ALL_AGENT_IDS) {
        agentState[id] = !server.agent_visibility[id] ? "hidden" : isEnabled(server, id) ? "enabled" : "disabled";
      }

      // Drift: registry says default-disabled but some agent has it enabled.
      // Package MCPs stay disabled by default when CLI/skill surfaces cover
      // the same job; explicit enables are still visible here as opt-in drift.
      const enabledAgents = Object.entries(agentState)
        .filter(([, v]) => v === "enabled")
        .map(([k]) => k as AgentId);
      const isMinimalDefault = (MINIMAL_DEFAULT_MCPS as readonly string[]).includes(server.name);
      const drift = !server.default_enabled && !isMinimalDefault && enabledAgents.length > 0;
      if (drift) warnings += 1;

      // Auth status: missing env matters only for enabled servers that require
      // auth. Context7 declares an optional key for higher limits, but works
      // keyless, so absence is not a failure.
      let authStatus: "ok" | "missing-env" | "n/a" = "n/a";
      const optionalAuth = server.name === "context7";
      if (server.auth_env_vars.length > 0 && enabledAgents.length > 0 && !optionalAuth) {
        const allPresent = server.auth_env_vars.every((v) => !!process.env[v]);
        authStatus = allPresent ? "ok" : "missing-env";
      }

      // Auth wiring: only meaningful for HTTP servers with declared auth.
      const wiring: Record<string, "ok" | "missing" | "n/a"> = {};
      const needsAuth = server.transport === "http" && server.auth_env_vars.length > 0 && !optionalAuth;
      for (const id of ALL_AGENT_IDS) {
        if (!needsAuth) { wiring[id] = "n/a"; continue; }
        if (agentState[id] !== "enabled") { wiring[id] = "n/a"; continue; }
        wiring[id] = (await checkMcpAuthWiring(home, id, server.name)) ? "ok" : "missing";
        if (wiring[id] === "missing") warnings += 1;
      }

      // Optional MCP `initialize` handshake. Only fired when caller passed
      // `--probe`. Stdio MCPs are spawned once per server (not per agent —
      // the binary is the same); HTTP MCPs are POSTed once per server.
      let handshake: "ok" | "fail" | "skipped" = "skipped";
      let handshakeError: string | undefined;
      if (opts.probe) {
        const res = await probeMcpInitialize(server);
        handshake = res.ok ? "ok" : "fail";
        if (!res.ok) {
          handshakeError = res.error;
          warnings += 1;
        }
      }

      mcpReport.servers.push({
        name: server.name,
        transport: server.transport,
        vendor: server.vendor,
        default_enabled: server.default_enabled,
        agent_state: agentState,
        auth_status: authStatus,
        reachable,
        drift,
        wiring,
        handshake,
        ...(handshakeError ? { handshake_error: handshakeError } : {}),
      });
    }
  } catch {
    // Registry not yet initialised — no entries to report
  }

  // Verdict
  const verdict: "ok" | "warning" | "error" =
    errors > 0 ? "error" : warnings > 0 ? "warning" : "ok";

  const report: DoctorReport = {
    bun: bunVersion,
    platform,
    agents: agentsReport,
    caveman: {
      agents: cavemanAgents,
      defaultMode: cavemanDefaultMode,
      defaultModeSource: cavemanSource,
      configPath: cavemanConfigPathOut,
    },
    tools: toolsReport,
    policy: policyReport,
    piMcpAdapter: {
      adapterPresent: piAdapterPresent,
      deepwikiPresent: piDeepwikiPresent,
    },
    mcp: mcpReport,
    components: {
      total: ALL_COMPONENTS.length,
      installed: installedComponents,
      database: componentDatabase,
      packageParity,
    },
    productKernel,
    memoriesSchema,
    worktrees,
    skillBudget,
    skillsCount,
    warnings,
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

async function buildMemoriesSchemaReport(): Promise<DoctorReport["memoriesSchema"]> {
  try {
    const { MikroORM } = await import("@mikro-orm/postgresql");
    const {
      ContextSnapshot,
      Memory,
      MemoryLink,
      createOrmConfig,
    } = await import("../db/mikro-orm.config.ts");
    const orm = await MikroORM.init(createOrmConfig());
    try {
      const memory = orm.getMetadata().get(Memory);
      const memoryLink = orm.getMetadata().get(MemoryLink);
      const contextSnapshot = orm.getMetadata().get(ContextSnapshot);
      const memoryProps = [
        "id",
        "orgId",
        "projectId",
        "global",
        "kind",
        "body",
        "tags",
        "importance",
        "source",
        "sourceRef",
        "createdAt",
        "updatedAt",
        "archived",
      ];
      const memoryProperties = memory.properties as Record<string, unknown>;
      const hasMemoryProps = memoryProps.every((prop) => memoryProperties[prop]);
      const memoryIndexes = [
        "memories_org_project_importance",
        "memories_org_kind",
        "memories_org_archived",
        "memories_org_global",
        "memories_body_tsv",
      ];
      const linkIndexes = ["memory_links_memory", "memory_links_target"];
      const snapshotIndexes = ["context_snapshots_run", "context_snapshots_task"];
      const hasIndexes = (
        meta: { indexes?: Array<{ name?: string }> },
        names: string[],
      ) => names.every((name) => meta.indexes?.some((index) => index.name === name));

      return {
        subsystem: "memories_schema",
        ok: hasMemoryProps &&
          hasIndexes(memory, memoryIndexes) &&
          hasIndexes(memoryLink, linkIndexes) &&
          hasIndexes(contextSnapshot, snapshotIndexes),
      };
    } finally {
      await orm.close(true);
    }
  } catch {
    return { subsystem: "memories_schema", ok: false };
  }
}

async function buildProductKernelReport(): Promise<DoctorReport["productKernel"]> {
  const { productDbDir } = await import("../product-kernel/paths.ts");
  const dir = productDbDir();
  const dbPath = `${dir}/main`;
  const exists = await Bun.file(`${dbPath}/PG_VERSION`).exists();
  if (!exists) {
    return {
      engine: "absent",
      dbPath,
      schemaApplied: 0,
      rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
      latestEventAt: null,
    };
  }
  try {
    const { openPglite } = await import("../product-kernel/db/pglite.ts");
    const db = await openPglite(dbPath);
    try {
      const schemaRows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = 'schema_migrations' AND relkind = 'r'`,
      );
      if ((schemaRows[0]?.count ?? 0) === 0) {
        return {
          engine: "pglite",
          dbPath,
          schemaApplied: 0,
          rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
          latestEventAt: null,
        };
      }
      const applied = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM schema_migrations`,
      );
      const counts = await db.query<{
        orgs: number;
        projects: number;
        documents: number;
        tasks: number;
        agent_runs: number;
      }>(
        `SELECT (SELECT COUNT(*)::int FROM orgs) AS orgs,
                (SELECT COUNT(*)::int FROM projects) AS projects,
                (SELECT COUNT(*)::int FROM documents) AS documents,
                (SELECT COUNT(*)::int FROM tasks) AS tasks,
                (SELECT COUNT(*)::int FROM agent_runs) AS agent_runs`,
      );
      const latest = await db.query<{ created_at: string | null }>(
        `SELECT created_at FROM events ORDER BY created_at DESC, id DESC LIMIT 1`,
      );
      return {
        engine: "pglite",
        dbPath,
        schemaApplied: applied[0]?.count ?? 0,
        rows: {
          orgs: counts[0]?.orgs ?? 0,
          projects: counts[0]?.projects ?? 0,
          documents: counts[0]?.documents ?? 0,
          tasks: counts[0]?.tasks ?? 0,
          agentRuns: counts[0]?.agent_runs ?? 0,
        },
        latestEventAt: latest[0]?.created_at ?? null,
      };
    } finally {
      await db.close();
    }
  } catch (err) {
    return {
      engine: "absent",
      dbPath,
      schemaApplied: 0,
      rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
      latestEventAt: null,
      error: (err as Error).message,
    };
  }
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
  } else if (pk.error) {
    console.log(`  error: ${pk.error}`);
  }
  console.log();

  console.log(
    `Memories schema: ${report.memoriesSchema.ok ? "ok" : "failed"} (${report.memoriesSchema.subsystem})`,
  );
  console.log();

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

  const { report, errors } = await buildReport({ probe });

  if (isJsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const home = process.env["HOME"] ?? "";
    printHumanFormat(report, home);
  }

  if (errors > 0) {
    process.exit(1);
  }
}
