// fulcrum doctor — environment health check.
// Reports: bun version, agent dirs detected, tool presence (which hooks fail-open),
// policy file location + size, skill count.

import { stat, readdir } from "node:fs/promises";
import { which, exists } from "../utils/proc.ts";
import { AGENTS } from "../agents/registry.ts";

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

  // Release toolchain.
  { cmd: "git-cliff",              usedBy: "`bun run changelog` and `bun run release`", required: false },

  // Skill trigger-rate eval harness.
  { cmd: "python3.12",             usedBy: "scripts/eval-skill-claude.sh (skill-creator's run_loop.py)", required: false },
];

interface AgentDir {
  label: string;
  path: string;
  rulesFile?: string;      // primary file that gets sentinel-spliced
  cavemanPath?: string;    // path whose existence signals caveman is installed
  settingsPath?: string;   // optional settings file (currently Claude Code only)
}

function agentDirs(): AgentDir[] {
  const home = process.env["HOME"] ?? "";
  return AGENTS.map((a) => ({
    label: a.label,
    path: a.baseDir(home),
    rulesFile: a.rulesFile(home),
    cavemanPath: a.cavemanInstallDir(home),
    settingsPath: a.settingsPath?.(home),
  }));
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
    if (!entry.isDirectory() || entry.name === "_template") continue;
    if (await exists(`${root}/${entry.name}/SKILL.md`)) n++;
  }
  return n;
}

async function buildReport(): Promise<{ report: DoctorReport; errors: number }> {
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
      activationHookPresent: false,
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
    skillsCount,
    warnings,
    errors,
    verdict,
  };

  return { report, errors };
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
  console.log();

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

  const { report, errors } = await buildReport();

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
