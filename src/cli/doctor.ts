// fulcrum doctor — environment health check.
// Reports: bun version, agent dirs detected, tool presence (which hooks fail-open),
// policy file location + size, skill count.

import { stat, readdir } from "node:fs/promises";
import { which, exists } from "../utils/proc.ts";

interface ToolCheck {
  cmd: string;
  usedBy: string;       // human-readable: "format hook (.py)", "index-rebuild hook"
  required: boolean;    // true = hook is broken without it; false = hook fail-opens
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
  rulesFile?: string;   // primary file that gets sentinel-spliced
}

function agentDirs(): AgentDir[] {
  const home = process.env["HOME"] ?? "";
  return [
    { label: "Claude Code", path: `${home}/.claude`,           rulesFile: `${home}/.claude/CLAUDE.md` },
    { label: "Codex CLI",   path: `${home}/.codex`,            rulesFile: `${home}/.codex/AGENTS.md` },
    { label: "Gemini CLI",  path: `${home}/.gemini`,           rulesFile: `${home}/.gemini/GEMINI.md` },
    { label: "OpenCode",    path: `${home}/.config/opencode`,  rulesFile: `${home}/.config/opencode/AGENTS.md` },
    { label: "Pi CLI",      path: `${home}/.pi/agent`,         rulesFile: `${home}/.pi/agent/AGENTS.md` },
  ];
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

export async function run(_args: string[]): Promise<void> {
  let warnings = 0;
  let errors = 0;

  console.log("fulcrum doctor — environment health check\n");

  // Bun
  console.log(`bun       ${Bun.version}`);
  console.log(`platform  ${process.platform}-${process.arch}`);
  console.log();

  // Agent dirs
  console.log("Agents detected:");
  for (const a of agentDirs()) {
    const dirOk = await exists(a.path);
    const rulesOk = a.rulesFile ? await exists(a.rulesFile) : false;
    if (!dirOk) {
      console.log(`  ${pad(a.label, 14)} ·  not installed`);
      continue;
    }
    let rulesNote = "";
    if (a.rulesFile && rulesOk) {
      try {
        const text = await Bun.file(a.rulesFile).text();
        rulesNote = text.includes("BEGIN FULCRUM RULES")
          ? "rules spliced"
          : "rules NOT spliced — run: fulcrum install";
        if (!text.includes("BEGIN FULCRUM RULES")) warnings++;
      } catch { /* unreadable, ignore */ }
    } else if (a.rulesFile) {
      rulesNote = "no rules file — run: fulcrum install";
      warnings++;
    }
    console.log(`  ${pad(a.label, 14)} ✓  ${rulesNote}`);
  }
  console.log();

  // Tools
  console.log("Tools (hooks fail-open when missing unless marked required):");
  for (const t of TOOLS) {
    const path = await which(t.cmd);
    if (path) {
      console.log(`  ${pad(t.cmd, 22)} ✓  ${path}`);
    } else if (t.required) {
      console.log(`  ${pad(t.cmd, 22)} ✗  MISSING — required by ${t.usedBy}`);
      errors++;
    } else {
      console.log(`  ${pad(t.cmd, 22)} ·  not installed — ${t.usedBy} will fail-open`);
    }
  }
  console.log();

  // Policy
  const policy = await policyPath();
  console.log(`Tool-output policy: ${policy}`);
  if (await exists(policy)) {
    try {
      const s = await stat(policy);
      console.log(`  size=${s.size}B  mtime=${s.mtime.toISOString()}`);
    } catch { /* ignore */ }
  } else {
    console.log("  · not present — run: fulcrum install (seeds default policy)");
    warnings++;
  }
  console.log();

  // Skills
  const skillCount = await countSkills();
  console.log(`Skills authored: ${skillCount} (in ${repoRoot()}/skills/)`);
  console.log();

  // Verdict
  if (errors > 0) {
    console.log(`✗ ${errors} error(s), ${warnings} warning(s)`);
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(`⚠ ${warnings} warning(s) — see above`);
    return;
  }
  console.log("✓ all checks passed");
}
