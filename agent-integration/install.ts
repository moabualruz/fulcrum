#!/usr/bin/env node
/**
 * Fulcrum GLOBAL installer.
 *
 * Installs Fulcrum as a user-wide tool: symlinks the CLI into ~/.local/bin,
 * registers the MCP server as a user-scope Claude Code server, merges the
 * PreToolUse hook into ~/.claude/settings.json, installs the Gemini extension
 * into ~/.gemini/extensions/fulcrum/, and installs the PI cockpit via `pi install`.
 *
 * Does NOT touch $CWD. For per-project context files (CLAUDE.md, PI.md, etc.),
 * use `fulcrum init` after global setup.
 *
 * Usage:
 *   pnpm setup                # all runtimes (claude + gemini + pi)
 *   pnpm setup:claude         # Claude Code only
 *   pnpm setup:gemini         # Gemini CLI only
 *   pnpm setup:pi             # PI cockpit only
 *   pnpm setup:check          # non-destructive check of current install state
 *   pnpm setup:dry            # print what `setup all` would do, no changes
 *
 * Flags:
 *   --dry-run        print actions without applying them
 *   --verbose        show extra diagnostics
 */

import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
  parseCanonicalSource,
  emitOpencode,
  emitCodex,
  writeRidersum,
} from "../packages/agent-fanout/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const HOME = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const VERBOSE = argv.includes("--verbose");

// Collected for end-of-run summary
interface StepResult {
  name: string;
  status: "ok" | "skip" | "warn" | "fail";
  detail?: string;
  recovery?: string;
  rollback?: string;   // how to undo this change if a later step fails
}
const results: StepResult[] = [];
let currentStep: StepResult | null = null;

/** Record a rollback instruction for the current step (called after a change is made). */
function setRollback(instruction: string): void {
  if (currentStep) currentStep.rollback = instruction;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
  if (currentStep && currentStep.status !== "fail" && currentStep.status !== "warn") {
    currentStep.status = "ok";
    currentStep.detail = msg;
  }
}
function skip(msg: string): void {
  console.log(`  — ${msg}`);
  if (currentStep && currentStep.status !== "fail" && currentStep.status !== "warn") {
    currentStep.status = "skip";
    currentStep.detail = msg;
  }
}
function warn(msg: string): void {
  console.warn(`  ⚠ ${msg}`);
  if (currentStep && currentStep.status !== "fail") {
    currentStep.status = "warn";
    currentStep.detail = msg;
  }
}
function fail(msg: string): void {
  console.error(`  ❌ ${msg}`);
  if (currentStep) {
    currentStep.status = "fail";
    currentStep.detail = msg;
  }
}
function dry(msg: string): void {
  console.log(`  [dry-run] ${msg}`);
}
function verbose(msg: string): void {
  if (VERBOSE) console.log(`    · ${msg}`);
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
}

function writeJson(p: string, data: unknown): void {
  if (DRY_RUN) {
    dry(`would write ${p}`);
    return;
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore", shell: "/bin/sh" });
    return true;
  } catch {
    return false;
  }
}

function resolveCliPath(): string {
  // Try the symlink we install first, then fall back to PATH lookup
  const symlink = path.join(HOME, ".local", "bin", "fulcrum");
  if (fs.existsSync(symlink)) return symlink;
  try {
    return execSync("command -v fulcrum", { encoding: "utf8", shell: "/bin/sh" }).trim();
  } catch {
    return "fulcrum";
  }
}

function mkdirp(dir: string): void {
  if (DRY_RUN) {
    if (!fs.existsSync(dir)) dry(`would mkdir -p ${dir}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
}

function step(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n── ${name} ──────────────────────────────────`);
  currentStep = { name, status: "ok" };
  results.push(currentStep);
  return Promise.resolve()
    .then(fn)
    .catch((err: Error) => {
      fail(`${name}: ${err.message}`);
      if (currentStep) {
        currentStep.recovery = recoveryHintFor(name);
        if (currentStep.recovery) {
          console.log(`     → ${currentStep.recovery}`);
        }
      }
      // Continue the rest of the plan — earlier version aborted on first failure.
    })
    .finally(() => {
      currentStep = null;
    });
}

function recoveryHintFor(name: string): string | undefined {
  if (name.includes("CLI symlink")) {
    return `fix perms on ~/.local/bin, then: pnpm run setup:claude`;
  }
  if (name.includes("Claude Code: user-scope MCP")) {
    return `manual: claude mcp add --scope user fulcrum -- fulcrum ${CLAUDE_MCP_ARGS.join(" ")}`;
  }
  if (name.includes("Claude Code: PreToolUse")) {
    return `edit ~/.claude/settings.json manually, see agent-integration/claude/settings-hooks-snippet.json`;
  }
  if (name.includes("Regenerate CLAUDE.md")) {
    return `run: pnpm gen:claude-md`;
  }
  if (name.includes("Doctor gate")) {
    return `fix failing checks shown above, then re-run setup; or bypass with: FULCRUM_SETUP_NO_GATE=1 pnpm setup`;
  }
  if (name.includes("Seed task and memory")) {
    return `manual: fulcrum task create --title "Fulcrum setup verified"`;
  }
  if (name.includes("Claude Code: global CLAUDE.md")) {
    return `manual: append agent-integration/claude/CLAUDE.md to ~/.claude/CLAUDE.md`;
  }
  if (name.includes("Claude Code: skills")) {
    return `manual: cp -r agent-integration/skills/*/ ~/.claude/skills/fulcrum/`;
  }
  if (name.includes("Gemini")) {
    return `manual: copy agent-integration/gemini/* into ~/.gemini/extensions/fulcrum/`;
  }
  if (name.includes("PI")) {
    return `install the pi CLI, then: pi install ${path.join(REPO_ROOT, "agent-integration", "pi", "cockpit")}`;
  }
  return undefined;
}

// ── 1. CLI bin (symlink ~/.local/bin/fulcrum) ─────────────────────────────────

function installCliBin(): void {
  const wrapperPath = path.join(REPO_ROOT, "fulcrum");
  if (!fs.existsSync(wrapperPath)) {
    throw new Error(`Wrapper script not found: ${wrapperPath}`);
  }

  const binDir = path.join(HOME, ".local", "bin");
  const linkPath = path.join(binDir, "fulcrum");

  mkdirp(binDir);

  // Remove any existing symlink or file (including broken symlinks).
  // lstatSync throws if the path doesn't exist (even for broken symlinks
  // lstatSync still returns stats). Handle every shape.
  let existed = false;
  try {
    const st = fs.lstatSync(linkPath);
    existed = true;
    verbose(`existing ${st.isSymbolicLink() ? "symlink" : st.isFile() ? "file" : "entry"} at ${linkPath}`);
    if (DRY_RUN) {
      dry(`would remove existing ${linkPath}`);
    } else {
      fs.unlinkSync(linkPath);
    }
  } catch {
    /* not present */
  }

  if (DRY_RUN) {
    dry(`would symlink ${wrapperPath} → ${linkPath}`);
  } else {
    fs.symlinkSync(wrapperPath, linkPath);
  }
  ok(`${existed ? "re-" : ""}linked ${wrapperPath} → ${linkPath}`);
  setRollback(`rm -f ${linkPath}`);

  // Warn if ~/.local/bin is not in PATH — show copy-pasteable lines for every shell.
  const pathEnv = process.env["PATH"] ?? "";
  if (!pathEnv.split(":").includes(binDir)) {
    warn(`${binDir} is not in PATH. Add to your shell rc:`);
    console.log("");
    console.log(`      # bash / zsh  (~/.bashrc or ~/.zshrc)`);
    console.log(`      export PATH="$HOME/.local/bin:$PATH"`);
    console.log("");
    console.log(`      # fish  (~/.config/fish/config.fish)`);
    console.log(`      fish_add_path $HOME/.local/bin`);
    console.log("");
  }
}

function verifyCliInPath(): void {
  if (DRY_RUN) {
    dry(`would run: fulcrum --version`);
    ok(`(dry-run) skipping PATH verification`);
    return;
  }
  try {
    const result = spawnSync("fulcrum", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status === 0 && result.stdout) {
      ok(`fulcrum resolves in PATH: ${result.stdout.trim().split("\n")[0]}`);
      return;
    }
    warn("`fulcrum` did not resolve — reopen your shell after setup");
  } catch {
    warn("`fulcrum` did not resolve — reopen your shell after setup");
  }
}

// ── 2. Claude Code: user-scope MCP server ─────────────────────────────────────

// ── Claude Code native plugin install (PR 14.1 / AD-10 dual-mode) ────────────
//
// FULCRUM_CLAUDE_INSTALL_MODE semantics:
//   auto    (default) — probe `claude plugin` subcommand; on success drive
//                       `claude plugin marketplace add moabualruz/fulcrum` +
//                       `claude plugin install fulcrum@fulcrum`. On any
//                       failure fall through to manual (idempotent).
//   native            — mandatory native; throws if CLI or marketplace path
//                       unavailable. Use in CI when you want to fail loudly.
//   manual            — skip the native path entirely. Use for older Claude
//                       CLI versions that don't support `claude plugin`.
//
// The marketplace manifest lives at the repo root
// (`.claude-plugin/marketplace.json`) and references this plugin via
// `source: "./agent-integration/claude"` (research 2026-04-20: `source:`
// resolves relative to the directory containing .claude-plugin/, which is
// the repo root; NOT relative to marketplace.json).
function installClaudePluginNative(): boolean {
  const mode = (process.env["FULCRUM_CLAUDE_INSTALL_MODE"] ?? "auto").toLowerCase();
  if (mode === "manual") {
    ok("skipped native plugin install (FULCRUM_CLAUDE_INSTALL_MODE=manual)");
    return false;
  }
  if (!commandExists("claude")) {
    if (mode === "native") throw new Error("`claude` CLI not found but FULCRUM_CLAUDE_INSTALL_MODE=native");
    warn("`claude` CLI not found — will fall through to manual install");
    return false;
  }

  // Probe `claude plugin` subcommand availability.
  const probe = spawnSync("claude", ["plugin", "--help"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    if (mode === "native") {
      throw new Error(`\`claude plugin\` subcommand unavailable: ${probe.stderr?.trim() ?? "unknown"}`);
    }
    warn("`claude plugin` subcommand not available on this Claude Code version — falling through to manual");
    return false;
  }

  if (DRY_RUN) {
    dry(`would run: claude plugin marketplace add moabualruz/fulcrum`);
    dry(`would run: claude plugin install fulcrum@fulcrum`);
    ok(`(dry-run) native plugin install path`);
    return true;
  }

  const mpResult = spawnSync("claude", ["plugin", "marketplace", "add", "moabualruz/fulcrum"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (mpResult.status !== 0) {
    const msg = mpResult.stderr?.trim() ?? `exit ${mpResult.status}`;
    if (mode === "native") throw new Error(`claude plugin marketplace add failed: ${msg}`);
    warn(`\`claude plugin marketplace add\` failed: ${msg} — falling through to manual`);
    return false;
  }

  const instResult = spawnSync("claude", ["plugin", "install", "fulcrum@fulcrum"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (instResult.status !== 0) {
    const msg = instResult.stderr?.trim() ?? `exit ${instResult.status}`;
    if (mode === "native") throw new Error(`claude plugin install failed: ${msg}`);
    warn(`\`claude plugin install\` failed: ${msg} — falling through to manual`);
    return false;
  }

  ok("installed via `claude plugin marketplace add moabualruz/fulcrum` + `claude plugin install fulcrum@fulcrum`");
  // PR 14.1 caveat: Claude marketplace update mechanics have open issues as
  // of Q2 2026 (anthropics/claude-code #46594, #46081, #38271, #37886).
  // After install, users may need to run `claude plugin marketplace refresh`
  // manually to pick up source changes. We surface this once per install.
  warn("note: run `claude plugin marketplace refresh` periodically to pick up updates from the Fulcrum marketplace — Claude update mechanics have known delays (Claude Code issues #46594/#46081/#38271/#37886).");
  return true;
}

function installClaudeMcp(): void {
  // Primary: use `claude mcp add --scope user` if available
  if (commandExists("claude")) {
    if (DRY_RUN) {
      dry(`would run: claude mcp remove --scope user fulcrum`);
      dry(`would run: claude mcp add --scope user fulcrum -- fulcrum ${CLAUDE_MCP_ARGS.join(" ")}`);
      ok(`(dry-run) Claude MCP registration`);
      return;
    }
    // Remove any existing entry first so re-running setup is idempotent
    spawnSync("claude", ["mcp", "remove", "--scope", "user", "fulcrum"], {
      stdio: "ignore",
    });
    const result = spawnSync(
      "claude",
      ["mcp", "add", "--scope", "user", "fulcrum", "--", "fulcrum", ...CLAUDE_MCP_ARGS],
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    if (result.status === 0) {
      ok("registered via `claude mcp add --scope user fulcrum`");
      return;
    }
    warn(`\`claude mcp add\` failed: ${result.stderr?.trim() ?? "unknown"}`);
    warn("falling back to direct ~/.claude.json edit");
  } else {
    warn("`claude` CLI not found — editing ~/.claude.json directly");
  }

  // Fallback: edit ~/.claude.json directly (user-scope MCP config)
  const claudeJsonPath = path.join(HOME, ".claude.json");
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(claudeJsonPath)) {
    try {
      cfg = readJson(claudeJsonPath);
    } catch (err) {
      throw new Error(`~/.claude.json is not valid JSON: ${(err as Error).message}`);
    }
  }
  const mcpServers = (cfg["mcpServers"] as Record<string, unknown> | undefined) ?? {};
  mcpServers["fulcrum"] = { command: "fulcrum", args: CLAUDE_MCP_ARGS };
  cfg["mcpServers"] = mcpServers;
  writeJson(claudeJsonPath, cfg);
  ok(`wrote fulcrum MCP entry → ${claudeJsonPath}`);
}

// ── 3. Claude Code: hooks → ~/.claude/settings.json ──────────────────────────

// Hook commands kept in sync with agent-integration/claude/settings-hooks-snippet.json.
const CLAUDE_PRE_COMMANDS          = ["fulcrum hook claude pre", "fulcrum hook claude"];
const CLAUDE_POST_COMMANDS         = ["fulcrum hook claude post"];
const CLAUDE_SESSION_START_COMMANDS = ["fulcrum hook claude session-start"];
const CLAUDE_STOP_COMMANDS         = ["fulcrum hook claude session-stop"];
const CLAUDE_PRE_COMPACT_COMMANDS  = ["fulcrum hook claude pre-compact"];
const CLAUDE_MCP_ARGS = ["serve", "mcp", "--mode", "filtered", "--runtime-capability", "hooks"];

function installClaudeHook(): void {
  const settingsPath = path.join(HOME, ".claude", "settings.json");

  mkdirp(path.dirname(settingsPath));

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = readJson(settingsPath);
    } catch (err) {
      throw new Error(`${settingsPath} is not valid JSON: ${(err as Error).message}`);
    }
  }

  const hooks = (settings["hooks"] as Record<string, unknown[]> | undefined) ?? {};

  /** Tool-use hooks (PreToolUse / PostToolUse) have a `matcher` field. */
  const ensureToolHook = (
    key: "PreToolUse" | "PostToolUse",
    canonicalCommand: string,
    acceptedCommands: string[],
  ): "added" | "present" => {
    const list = (hooks[key] as Array<Record<string, unknown>> | undefined) ?? [];
    const alreadyInstalled = list.some((entry) => {
      const inner = (entry["hooks"] as Array<Record<string, unknown>> | undefined) ?? [];
      return inner.some((h) => acceptedCommands.includes(h["command"] as string));
    });
    if (alreadyInstalled) return "present";
    list.push({
      matcher: "*",
      hooks: [{ type: "command", command: canonicalCommand }],
    });
    hooks[key] = list;
    return "added";
  };

  /** Lifecycle hooks (SessionStart / Stop / PreCompact) have no `matcher`. */
  const ensureLifecycleHook = (
    key: "SessionStart" | "Stop" | "PreCompact",
    canonicalCommand: string,
    acceptedCommands: string[],
  ): "added" | "present" => {
    const list = (hooks[key] as Array<Record<string, unknown>> | undefined) ?? [];
    const alreadyInstalled = list.some((entry) => {
      const inner = (entry["hooks"] as Array<Record<string, unknown>> | undefined) ?? [];
      return inner.some((h) => acceptedCommands.includes(h["command"] as string));
    });
    if (alreadyInstalled) return "present";
    list.push({ hooks: [{ type: "command", command: canonicalCommand }] });
    hooks[key] = list;
    return "added";
  };

  const preResult          = ensureToolHook("PreToolUse",  "fulcrum hook claude pre",          CLAUDE_PRE_COMMANDS);
  const postResult         = ensureToolHook("PostToolUse", "fulcrum hook claude post",         CLAUDE_POST_COMMANDS);
  const startResult        = ensureLifecycleHook("SessionStart", "fulcrum hook claude session-start", CLAUDE_SESSION_START_COMMANDS);
  const stopResult         = ensureLifecycleHook("Stop",         "fulcrum hook claude session-stop",  CLAUDE_STOP_COMMANDS);
  const preCompactResult   = ensureLifecycleHook("PreCompact",   "fulcrum hook claude pre-compact",   CLAUDE_PRE_COMPACT_COMMANDS);

  settings["hooks"] = hooks;

  const allPresent = [preResult, postResult, startResult, stopResult, preCompactResult].every(r => r === "present");
  if (allPresent) {
    skip("all 5 hooks already present");
    return;
  }

  writeJson(settingsPath, settings);
  const parts: string[] = [];
  if (preResult        === "added") parts.push("PreToolUse");
  if (postResult       === "added") parts.push("PostToolUse");
  if (startResult      === "added") parts.push("SessionStart");
  if (stopResult       === "added") parts.push("Stop");
  if (preCompactResult === "added") parts.push("PreCompact");
  ok(`added ${parts.join(" + ")} hook${parts.length > 1 ? "s" : ""} → ${settingsPath}`);
}

// ── 3b. Regenerate CLAUDE.md from TOOL_SCHEMAS ───────────────────────────────
// Keeps the installed CLAUDE.md in sync with the actual MCP tool list so the
// tool count and table are never stale after a tool is added or removed.

function regenerateClaudeMd(): void {
  if (DRY_RUN) {
    dry("would run: pnpm gen:claude-md");
    ok("(dry-run) CLAUDE.md regeneration");
    return;
  }
  const result = spawnSync("pnpm", ["gen:claude-md"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status === 0) {
    ok("regenerated agent-integration/claude/CLAUDE.md from TOOL_SCHEMAS");
  } else {
    warn(`gen:claude-md failed (non-fatal): ${(result.stderr ?? result.stdout ?? "").trim().slice(0, 200)}`);
  }
}

// ── 4. Claude Code: global CLAUDE.md context (~/.claude/CLAUDE.md) ────────────

const MARKER_START = "<!-- fulcrum:begin -->";
const MARKER_END = "<!-- fulcrum:end -->";

function installClaudeContext(): void {
  const globalPath = path.join(HOME, ".claude", "CLAUDE.md");
  const templatePath = path.join(REPO_ROOT, "agent-integration", "claude", "CLAUDE.md");

  if (!fs.existsSync(templatePath)) {
    throw new Error(`template not found: ${templatePath}`);
  }

  mkdirp(path.dirname(globalPath));

  const body = fs.readFileSync(templatePath, "utf8");
  const section = `${MARKER_START}\n${body.trimEnd()}\n${MARKER_END}\n`;

  let existing = "";
  if (fs.existsSync(globalPath)) {
    existing = fs.readFileSync(globalPath, "utf8");
  }

  // Strip any prior fulcrum section so re-runs update in place (idempotent).
  const regex = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, "g");
  const priorCount = (existing.match(regex) ?? []).length;
  if (priorCount > 1) {
    verbose(`found ${priorCount} prior fulcrum sections — collapsing to one`);
  }
  existing = existing.replace(regex, "").trimEnd();

  const merged = existing ? `${existing}\n\n${section}` : section;
  if (DRY_RUN) {
    dry(`would write fulcrum section to ${globalPath}`);
  } else {
    fs.writeFileSync(globalPath, merged, "utf8");
  }
  ok(`wrote Fulcrum section → ${globalPath}`);
}

// ── 5b. Claude Code: skills → ~/.claude/skills/fulcrum/ ──────────────────────
// Skills are in directory form: agent-integration/skills/<name>/SKILL.md
// Each skill directory is copied to ~/.claude/skills/fulcrum/<name>/SKILL.md.
// Claude Code auto-loads user-scope skills from ~/.claude/skills/ at session start
// and surfaces them to the agent when the skill's `description` frontmatter field
// matches the current task. A namespaced subdirectory (`fulcrum/`) avoids
// collisions with other tool suites that install their own skills.
// index.md is installed as a flat file (not a skill, just an index README).

function installClaudeSkills(): void {
  const srcDir = path.join(REPO_ROOT, "agent-integration", "skills");
  if (!fs.existsSync(srcDir)) {
    warn(`skills source dir not found: ${srcDir}`);
    return;
  }

  const destDir = path.join(HOME, ".claude", "skills", "fulcrum");
  mkdirp(destDir);

  let copied = 0;

  // Install directory-form skills: each <name>/SKILL.md
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  const skillDirs = entries.filter(
    (e) => e.isDirectory() && fs.existsSync(path.join(srcDir, e.name, "SKILL.md"))
  );

  for (const dir of skillDirs) {
    const skillSrc = path.join(srcDir, dir.name, "SKILL.md");
    const skillDestDir = path.join(destDir, dir.name);
    const skillDest = path.join(skillDestDir, "SKILL.md");
    if (DRY_RUN) {
      dry(`would copy ${skillSrc} → ${skillDest}`);
      copied++;
      continue;
    }
    mkdirp(skillDestDir);
    fs.copyFileSync(skillSrc, skillDest);
    copied++;
  }

  // Also install flat index.md (README, not a skill)
  const indexSrc = path.join(srcDir, "index.md");
  if (fs.existsSync(indexSrc)) {
    const indexDest = path.join(destDir, "index.md");
    if (DRY_RUN) {
      dry(`would copy ${indexSrc} → ${indexDest}`);
    } else {
      fs.copyFileSync(indexSrc, indexDest);
    }
  }

  if (copied === 0 && skillDirs.length === 0) {
    skip("no skill directories to install");
    return;
  }
  ok(`installed ${copied} skill(s) → ${destDir}`);
}

// ── 5c. Claude Code: subagent MDs → ~/.claude/agents/ ────────────────────────
// 24 role MDs generated by `scripts/gen-agent-mds.ts`. Claude Code loads
// agent MDs from ~/.claude/agents/ when a subagent is invoked by role slug.

function installClaudeAgentMds(): void {
  const srcDir = path.join(REPO_ROOT, "agent-integration", "claude", "agents");
  if (!fs.existsSync(srcDir)) {
    warn(`agent-mds source dir not found: ${srcDir} — run: pnpm gen:agent-mds`);
    return;
  }
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    warn("no agent MD files found — run: pnpm gen:agent-mds");
    return;
  }

  const destDir = path.join(HOME, ".claude", "agents");
  mkdirp(destDir);

  let copied = 0;
  for (const f of files) {
    const src = path.join(srcDir, f);
    const dest = path.join(destDir, f);
    if (DRY_RUN) {
      dry(`would copy ${src} → ${dest}`);
      copied++;
      continue;
    }
    fs.copyFileSync(src, dest);
    copied++;
  }
  ok(`installed ${copied} agent MD file(s) → ${destDir}`);
  setRollback(`rm -f ${destDir}/fulcrum-*.md  # removes fulcrum agent MDs only`);
}

// ── 5b. Claude Code: slash commands → ~/.claude/commands/ ────────────────────
// fulcrum-status, fulcrum-task, fulcrum-memory, fulcrum-run are placed in the
// global commands directory so they're available in every Claude Code session.

function installClaudeCommands(): void {
  const srcDir = path.join(REPO_ROOT, "agent-integration", "claude", "commands");
  if (!fs.existsSync(srcDir)) {
    warn(`commands source dir not found: ${srcDir}`);
    return;
  }
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    warn("no command files found in agent-integration/claude/commands/");
    return;
  }

  const destDir = path.join(HOME, ".claude", "commands");
  mkdirp(destDir);

  let copied = 0;
  for (const f of files) {
    const src = path.join(srcDir, f);
    const dest = path.join(destDir, f);
    if (DRY_RUN) {
      dry(`would copy ${src} → ${dest}`);
      copied++;
      continue;
    }
    fs.copyFileSync(src, dest);
    copied++;
  }
  ok(`installed ${copied} slash command(s) → ${destDir}`);
  setRollback(`rm -f ${destDir}/fulcrum-*.md  # removes fulcrum slash commands only`);
}

// ── 6. Gemini CLI: user extension (~/.gemini/extensions/fulcrum/) ─────────────

/** Recursively copy all files from srcDir into destDir, preserving structure. */
function copyDirContents(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      count += copyDirContents(srcPath, destPath);
    } else {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function installGeminiExtension(): void {
  const extDir = path.join(HOME, ".gemini", "extensions", "fulcrum");
  const srcDir = path.join(REPO_ROOT, "agent-integration", "gemini");

  // Flat files
  const flatFiles = [
    ["gemini-extension.json", "gemini-extension.json"],
    ["GEMINI.md", "GEMINI.md"],
    [path.join("hooks", "hooks.json"), path.join("hooks", "hooks.json")],
  ];

  // Subdirectories to copy wholesale: commands/, skills/, agents/
  const subDirs = ["commands", "skills", "agents"];

  if (DRY_RUN) {
    for (const [src] of flatFiles) {
      dry(`would copy ${path.join(srcDir, src)} → ${path.join(extDir, src)}`);
    }
    for (const d of subDirs) {
      if (fs.existsSync(path.join(srcDir, d))) {
        dry(`would copy ${path.join(srcDir, d)}/ → ${path.join(extDir, d)}/`);
      }
    }
    ok(`(dry-run) Gemini extension`);
    return;
  }

  mkdirp(extDir);

  for (const [src, dst] of flatFiles) {
    const from = path.join(srcDir, src);
    const to = path.join(extDir, dst);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  let dirCount = 0;
  for (const d of subDirs) {
    const copied = copyDirContents(path.join(srcDir, d), path.join(extDir, d));
    if (copied > 0) dirCount++;
  }

  ok(`installed extension → ${extDir} (flat files + ${dirCount} dir(s): ${subDirs.filter(d => fs.existsSync(path.join(srcDir, d))).join(", ")})`);
  setRollback(`rm -rf ${extDir}  # removes entire Gemini extension`);
}

// ── 7. PI: cockpit extension (pi install <cockpit>) ──────────────────────────

function installPiCockpit(): void {
  const cockpitDir = path.join(REPO_ROOT, "agent-integration", "pi", "cockpit");

  if (!commandExists("pi")) {
    warn("`pi` CLI not found — skipping cockpit install");
    console.log(`      To install later: pi install ${cockpitDir}`);
    return;
  }

  if (DRY_RUN) {
    dry(`would run: pi install ${cockpitDir}`);
    ok(`(dry-run) PI cockpit`);
    return;
  }

  const result = spawnSync("pi", ["install", cockpitDir], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`\`pi install\` failed (status ${result.status ?? "unknown"})`);
  }
  ok("PI cockpit installed");
}

// ── 8. Non-destructive check mode ─────────────────────────────────────────────

interface CheckRow {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

function runCheck(): number {
  console.log(`\nFulcrum install check — home: ${HOME}\n`);
  const rows: CheckRow[] = [];

  // fulcrum CLI symlink
  const binDir = path.join(HOME, ".local", "bin");
  const linkPath = path.join(binDir, "fulcrum");
  try {
    const st = fs.lstatSync(linkPath);
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(linkPath);
      // Broken symlink check
      if (fs.existsSync(linkPath)) {
        rows.push({ label: "fulcrum CLI", status: "ok", detail: `${linkPath} → ${target}` });
      } else {
        rows.push({ label: "fulcrum CLI", status: "fail", detail: `broken symlink → ${target}` });
      }
    } else {
      rows.push({ label: "fulcrum CLI", status: "warn", detail: `${linkPath} exists but is not a symlink` });
    }
  } catch {
    rows.push({ label: "fulcrum CLI", status: "fail", detail: `missing at ${linkPath}` });
  }

  // PATH
  const pathEnv = process.env["PATH"] ?? "";
  if (pathEnv.split(":").includes(binDir)) {
    rows.push({ label: "PATH", status: "ok", detail: `~/.local/bin is in PATH` });
  } else {
    rows.push({ label: "PATH", status: "warn", detail: `~/.local/bin not in PATH` });
  }

  // Claude MCP
  if (commandExists("claude")) {
    const r = spawnSync("claude", ["mcp", "list"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (r.status === 0 && /fulcrum/i.test(r.stdout ?? "")) {
      rows.push({ label: "Claude MCP", status: "ok", detail: `registered (user scope)` });
    } else {
      rows.push({ label: "Claude MCP", status: "fail", detail: `not registered in 'claude mcp list'` });
    }
  } else {
    // Fall back to ~/.claude.json inspection
    const claudeJsonPath = path.join(HOME, ".claude.json");
    if (fs.existsSync(claudeJsonPath)) {
      try {
        const cfg = readJson(claudeJsonPath);
        const mcpServers = (cfg["mcpServers"] as Record<string, unknown> | undefined) ?? {};
        if (mcpServers["fulcrum"]) {
          rows.push({ label: "Claude MCP", status: "ok", detail: `present in ~/.claude.json (claude CLI not installed)` });
        } else {
          rows.push({ label: "Claude MCP", status: "fail", detail: `not in ~/.claude.json` });
        }
      } catch {
        rows.push({ label: "Claude MCP", status: "fail", detail: `~/.claude.json unreadable` });
      }
    } else {
      rows.push({ label: "Claude MCP", status: "warn", detail: `claude CLI not found, no ~/.claude.json` });
    }
  }

  // Claude hook
  const settingsPath = path.join(HOME, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = readJson(settingsPath);
      const hooks = (settings["hooks"] as Record<string, unknown[]> | undefined) ?? {};
      const hasHook = (
        key: "PreToolUse" | "PostToolUse" | "SessionStart" | "Stop" | "PreCompact",
        accepted: string[],
      ): boolean => {
        const list = (hooks[key] as Array<Record<string, unknown>> | undefined) ?? [];
        return list.some((entry) => {
          const inner = (entry["hooks"] as Array<Record<string, unknown>> | undefined) ?? [];
          return inner.some((h) => accepted.includes(h["command"] as string));
        });
      };
      const preFound        = hasHook("PreToolUse",   CLAUDE_PRE_COMMANDS);
      const postFound       = hasHook("PostToolUse",  CLAUDE_POST_COMMANDS);
      const startFound      = hasHook("SessionStart", CLAUDE_SESSION_START_COMMANDS);
      const stopFound       = hasHook("Stop",         CLAUDE_STOP_COMMANDS);
      const preCompactFound = hasHook("PreCompact",   CLAUDE_PRE_COMPACT_COMMANDS);
      const allFound = preFound && postFound && startFound && stopFound && preCompactFound;
      const anyFound = preFound || postFound || startFound || stopFound || preCompactFound;
      if (allFound) {
        rows.push({ label: "Claude hook", status: "ok", detail: `all 5 lifecycle hooks in ${settingsPath}` });
      } else if (anyFound) {
        const missing: string[] = [];
        if (!preFound)        missing.push("PreToolUse");
        if (!postFound)       missing.push("PostToolUse");
        if (!startFound)      missing.push("SessionStart");
        if (!stopFound)       missing.push("Stop");
        if (!preCompactFound) missing.push("PreCompact");
        rows.push({ label: "Claude hook", status: "warn", detail: `missing: ${missing.join(", ")} in ${settingsPath}` });
      } else {
        rows.push({ label: "Claude hook", status: "fail", detail: `no fulcrum hooks in ${settingsPath}` });
      }
    } catch {
      rows.push({ label: "Claude hook", status: "fail", detail: `${settingsPath} unreadable` });
    }
  } else {
    rows.push({ label: "Claude hook", status: "fail", detail: `${settingsPath} does not exist` });
  }

  // Claude context
  const globalCtx = path.join(HOME, ".claude", "CLAUDE.md");
  if (fs.existsSync(globalCtx)) {
    const content = fs.readFileSync(globalCtx, "utf8");
    const count = (content.match(/<!-- fulcrum:begin -->/g) ?? []).length;
    if (count === 1) {
      rows.push({ label: "Claude context", status: "ok", detail: `Fulcrum section in ${globalCtx}` });
    } else if (count > 1) {
      rows.push({ label: "Claude context", status: "warn", detail: `duplicate Fulcrum sections (${count}) — re-run setup to fix` });
    } else {
      rows.push({ label: "Claude context", status: "fail", detail: `no Fulcrum section in ${globalCtx}` });
    }
  } else {
    rows.push({ label: "Claude context", status: "fail", detail: `${globalCtx} does not exist` });
  }

  // Claude skills (directory form: each skill is <name>/SKILL.md)
  const skillsDir = path.join(HOME, ".claude", "skills", "fulcrum");
  const srcSkillsDir = path.join(REPO_ROOT, "agent-integration", "skills");
  if (fs.existsSync(skillsDir)) {
    const destDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, "SKILL.md"))).length;
    const srcDirs = fs.existsSync(srcSkillsDir)
      ? fs.readdirSync(srcSkillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && fs.existsSync(path.join(srcSkillsDir, e.name, "SKILL.md"))).length
      : 0;
    if (srcDirs > 0 && destDirs >= srcDirs) {
      rows.push({ label: "Claude skills", status: "ok", detail: `${skillsDir} (${destDirs} skills)` });
    } else {
      rows.push({
        label: "Claude skills",
        status: "warn",
        detail: `${skillsDir} (${destDirs}/${srcDirs} skills — re-run setup:claude)`,
      });
    }
  } else {
    rows.push({ label: "Claude skills", status: "fail", detail: `${skillsDir} (missing — run setup:claude)` });
  }

  // Claude slash commands
  const cmdDir = path.join(HOME, ".claude", "commands");
  const srcCmdDir = path.join(REPO_ROOT, "agent-integration", "claude", "commands");
  if (fs.existsSync(cmdDir)) {
    const srcFiles = fs.existsSync(srcCmdDir)
      ? fs.readdirSync(srcCmdDir).filter((f) => f.endsWith(".md"))
      : [];
    const destFiles = fs.readdirSync(cmdDir).filter((f) => f.startsWith("fulcrum-") && f.endsWith(".md"));
    if (srcFiles.length > 0 && destFiles.length >= srcFiles.length) {
      rows.push({ label: "Claude commands", status: "ok", detail: `${cmdDir} (${destFiles.length} commands)` });
    } else {
      rows.push({ label: "Claude commands", status: "warn", detail: `${cmdDir} (${destFiles.length}/${srcFiles.length} fulcrum commands)` });
    }
  } else {
    rows.push({ label: "Claude commands", status: "fail", detail: `${cmdDir} (missing — run setup:claude)` });
  }

  // Gemini extension
  const geminiDir = path.join(HOME, ".gemini", "extensions", "fulcrum");
  if (
    fs.existsSync(path.join(geminiDir, "gemini-extension.json")) &&
    fs.existsSync(path.join(geminiDir, "GEMINI.md")) &&
    fs.existsSync(path.join(geminiDir, "hooks", "hooks.json"))
  ) {
    rows.push({ label: "Gemini extension", status: "ok", detail: geminiDir });
  } else if (fs.existsSync(geminiDir)) {
    rows.push({ label: "Gemini extension", status: "fail", detail: `${geminiDir} exists but missing files (hooks/hooks.json required)` });
  } else {
    rows.push({ label: "Gemini extension", status: "fail", detail: `${geminiDir} does not exist` });
  }

  // PI cockpit
  if (!commandExists("pi")) {
    rows.push({ label: "PI cockpit", status: "warn", detail: `pi CLI not found, skipping` });
  } else {
    const r = spawnSync("pi", ["list"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (r.status === 0 && /fulcrum|cockpit/i.test(r.stdout ?? "")) {
      rows.push({ label: "PI cockpit", status: "ok", detail: `installed` });
    } else {
      rows.push({ label: "PI cockpit", status: "warn", detail: `pi CLI present but cockpit not detected in 'pi list'` });
    }
  }

  // Print table
  const maxLabel = Math.max(...rows.map((r) => r.label.length));
  for (const r of rows) {
    const icon = r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : "✗";
    const pad = " ".repeat(maxLabel - r.label.length);
    console.log(`  ${r.label}${pad}  ${icon}  ${r.detail}`);
  }

  const failures = rows.filter((r) => r.status === "fail").length;
  const warns = rows.filter((r) => r.status === "warn").length;
  console.log("");
  if (failures > 0) {
    console.log(`${failures} failing, ${warns} warnings. Run: pnpm run setup`);
    return 1;
  }
  if (warns > 0) {
    console.log(`all core items installed, ${warns} warnings (see above).`);
    return 0;
  }
  console.log(`✅  all green.`);
  return 0;
}

// ── Entry point ───────────────────────────────────────────────────────────────

type Target = "all" | "claude" | "gemini" | "pi" | "codex" | "opencode" | "check";

async function installCodexGlobal(): Promise<void> {
  await installCodex({ dryRun: DRY_RUN, globalHome: HOME });
}

async function installOpencodeGlobal(): Promise<void> {
  await installOpencode({ dryRun: DRY_RUN });
}

const plans: Record<Exclude<Target, "check">, Array<[string, () => void | Promise<void>]>> = {
  all: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Claude Code: native plugin install (dual-mode; auto/native/manual)", installClaudePluginNative],
    ["Claude Code: user-scope MCP server", installClaudeMcp],
    ["Claude Code: PreToolUse hook", installClaudeHook],
    ["Regenerate CLAUDE.md from TOOL_SCHEMAS", regenerateClaudeMd],
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
    ["Claude Code: skills → ~/.claude/skills/fulcrum/", installClaudeSkills],
    ["Claude Code: agent MDs → ~/.claude/agents/", installClaudeAgentMds],
    ["Claude Code: slash commands → ~/.claude/commands/", installClaudeCommands],
    ["Gemini CLI: user extension", installGeminiExtension],
    ["PI: cockpit extension", installPiCockpit],
    ["Codex CLI: config + hooks + skills", installCodexGlobal],
    ["opencode: plugin + hooks", installOpencodeGlobal],
    ["MCP smoke test", smokeMcp],
    ["Doctor gate", runDoctorGate],
    ["Seed task and memory", writeSeedData],
  ],
  claude: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Claude Code: native plugin install (dual-mode; auto/native/manual)", installClaudePluginNative],
    ["Claude Code: user-scope MCP server", installClaudeMcp],
    ["Claude Code: PreToolUse hook", installClaudeHook],
    ["Regenerate CLAUDE.md from TOOL_SCHEMAS", regenerateClaudeMd],
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
    ["Claude Code: skills → ~/.claude/skills/fulcrum/", installClaudeSkills],
    ["Claude Code: agent MDs → ~/.claude/agents/", installClaudeAgentMds],
    ["Claude Code: slash commands → ~/.claude/commands/", installClaudeCommands],
    ["MCP smoke test", smokeMcp],
    ["Doctor gate", runDoctorGate],
    ["Seed task and memory", writeSeedData],
  ],
  gemini: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Gemini CLI: user extension", installGeminiExtension],
  ],
  pi: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["PI: cockpit extension", installPiCockpit],
  ],
  codex: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Codex CLI: config + hooks + skills", installCodexGlobal],
  ],
  opencode: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["opencode: plugin + hooks", installOpencodeGlobal],
  ],
};

// ── Doctor gate ───────────────────────────────────────────────────────────────
// Runs `fulcrum doctor --json` after install and fails the step if any check
// reports status "fail". Bypass with FULCRUM_SETUP_NO_GATE=1 or --no-doctor-gate.

const NO_DOCTOR_GATE =
  argv.includes("--no-doctor-gate") || process.env["FULCRUM_SETUP_NO_GATE"] === "1";

function runDoctorGate(): void {
  if (NO_DOCTOR_GATE) {
    skip("doctor gate bypassed (--no-doctor-gate / FULCRUM_SETUP_NO_GATE=1)");
    return;
  }
  if (!commandExists("fulcrum")) {
    warn("doctor gate skipped — fulcrum not in PATH yet");
    return;
  }
  if (DRY_RUN) {
    dry("would run: fulcrum doctor --json");
    ok("(dry-run) doctor gate");
    return;
  }

  const result = spawnSync("fulcrum", ["doctor", "--json"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.error) {
    warn(`doctor gate: failed to spawn fulcrum doctor: ${result.error.message}`);
    return;
  }

  interface DoctorCheck { name: string; status: "pass" | "warn" | "fail"; message: string }
  let checks: DoctorCheck[] = [];
  try {
    checks = JSON.parse(result.stdout ?? "[]") as DoctorCheck[];
  } catch {
    warn(`doctor gate: could not parse JSON output (exit ${result.status ?? "?"})`);
    return;
  }

  const failures = checks.filter((c) => c.status === "fail");
  if (failures.length > 0) {
    const names = failures.map((c) => c.name).join(", ");
    fail(`doctor gate: ${failures.length} failing check(s): ${names}`);
    return;
  }

  const warns = checks.filter((c) => c.status === "warn").length;
  if (warns > 0) {
    ok(`doctor: all checks pass (${warns} warning${warns > 1 ? "s" : ""})`);
  } else {
    ok(`doctor: all ${checks.length} checks pass`);
  }
}

// ── Seed task and memory entry ────────────────────────────────────────────────
// Writes one task and one memory entry to validate the DB write path.
// Idempotent: checks for an existing seed task before creating.

async function writeSeedData(): Promise<void> {
  if (!commandExists("fulcrum")) {
    warn("seed data skipped — fulcrum not in PATH");
    return;
  }
  if (DRY_RUN) {
    dry("would create seed task: 'Fulcrum setup verified'");
    dry("would write seed memory entry via MCP write_memory");
    ok("(dry-run) seed data");
    return;
  }

  // ── Seed task ──────────────────────────────────────────────────────────────
  // Create a seed task to confirm task writes work. Idempotent: only creates
  // if no task titled "Fulcrum setup verified" already exists.
  const SEED_TASK_TITLE = "Fulcrum setup verified";
  let taskCreated = false;

  const listResult = spawnSync(
    "fulcrum",
    ["task", "list", "--json"],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );

  let alreadyExists = false;
  if (listResult.status === 0) {
    try {
      const tasks = JSON.parse(listResult.stdout ?? "[]") as Array<{ title?: string }>;
      alreadyExists = tasks.some((t) => t.title === SEED_TASK_TITLE);
    } catch { /* ignore parse errors */ }
  }

  if (!alreadyExists) {
    const createResult = spawnSync(
      "fulcrum",
      ["task", "create",
        "--title", SEED_TASK_TITLE,
        "--description", "Auto-created by fulcrum setup to verify task writes. Safe to delete.",
        "--priority", "low"],
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    if (createResult.status === 0) {
      taskCreated = true;
    } else {
      warn(`seed task create failed: ${(createResult.stderr ?? "").trim().slice(0, 200)}`);
    }
  }

  // ── Seed memory via MCP write_memory ──────────────────────────────────────
  // Send a write_memory JSON-RPC call to the planner-filtered MCP server to confirm
  // memory writes work end-to-end. Uses the same pattern as the MCP smoke test.
  const TIMEOUT_MS = 5000;
  let memoryWritten = false;

  // Get workspace context first via get_current_context
  const initRequest = JSON.stringify({
    jsonrpc: "2.0", method: "initialize", id: 1,
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fulcrum-seed", version: "1" } },
  }) + "\n";

  const ctxRequest = JSON.stringify({
    jsonrpc: "2.0", method: "tools/call", id: 2,
    params: { name: "get_current_context", arguments: {} },
  }) + "\n";

  const seedMemoryContent = `Fulcrum setup completed successfully. MCP server is accessible and DB writes are functional.`;

  try {
    const ctxChild = spawnSync("fulcrum", CLAUDE_MCP_ARGS, {
      input: initRequest + ctxRequest,
      timeout: TIMEOUT_MS,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const ctxStdout = ctxChild.stdout ?? "";
    const ctxLines = ctxStdout.split("\n").filter(Boolean);
    let workspaceId = "";
    let projectId = "";

    for (const line of ctxLines) {
      try {
        const j = JSON.parse(line) as Record<string, unknown>;
        if (j["id"] === 2) {
          const result = j["result"] as Record<string, unknown> | undefined;
          const content = result?.["content"] as Array<{ type: string; text: string }> | undefined;
          const text = content?.[0]?.text ?? "";
          const ctx = JSON.parse(text) as Record<string, unknown>;
          workspaceId = (ctx["workspace_id"] as string) ?? "";
          projectId = (ctx["project_id"] as string) ?? "";
        }
      } catch { /* skip non-JSON */ }
    }

    if (workspaceId && projectId) {
      const writeRequest = JSON.stringify({
        jsonrpc: "2.0", method: "tools/call", id: 3,
        params: {
          name: "write_memory",
          arguments: {
            content: seedMemoryContent,
            workspace_id: workspaceId,
            project_id: projectId,
            tags: ["setup", "seed"],
            importance: 0.5,
          },
        },
      }) + "\n";

      const writeChild = spawnSync("fulcrum", CLAUDE_MCP_ARGS, {
        input: initRequest + writeRequest,
        timeout: TIMEOUT_MS,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const writeStdout = writeChild.stdout ?? "";
      const writeLines = writeStdout.split("\n").filter(Boolean);
      for (const line of writeLines) {
        try {
          const j = JSON.parse(line) as Record<string, unknown>;
          if (j["id"] === 3 && j["result"]) { memoryWritten = true; }
        } catch { /* skip */ }
      }
    }
  } catch {
    // best-effort
  }

  const parts: string[] = [];
  if (alreadyExists) parts.push("seed task already exists");
  else if (taskCreated) parts.push("seed task created");
  if (memoryWritten) parts.push("seed memory written");
  else parts.push("seed memory skipped (best-effort)");

  ok(`write path validated: ${parts.join(", ")}`);
}

// ── Post-install MCP smoke test ───────────────────────────────────────────────
// Spawns the configured Claude MCP command, sends a JSON-RPC `initialize`,
// and waits for the matching response on stdout. Kills the server as soon as
// the response arrives.
//
// Non-blocking: failure is a warning.
//
// Why not `spawnSync` with `input:` + `timeout:`? The fulcrum MCP server is a
// long-lived stdio server — it does not exit on stdin EOF, so spawnSync would
// always hit its timeout (ETIMEDOUT) regardless of whether the response
// arrived. An async spawn that kills the child on first valid response is
// the correct shape and matches how real MCP clients (Claude Code, Codex,
// Gemini) actually drive the server.

async function smokeMcp(): Promise<void> {
  if (DRY_RUN) {
    dry(`would run MCP smoke test: fulcrum ${CLAUDE_MCP_ARGS.join(" ")} + initialize request`);
    ok("(dry-run) smoke test skipped");
    return;
  }
  if (!commandExists("fulcrum")) {
    warn("smoke test skipped — fulcrum not in PATH");
    return;
  }
  const { spawn } = await import("node:child_process");
  const TIMEOUT_MS = 30_000;
  const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "fulcrum-smoke-test", version: "1" },
    },
  }) + "\n";

  const fulcrumBin = resolveCliPath();
  const child = spawn(fulcrumBin, CLAUDE_MCP_ARGS, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PATH: process.env["PATH"] ?? "", FULCRUM_NO_MONITOR: "1" },
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  let responseLine: string | null = null;
  // Boxed so TS control-flow analysis doesn't narrow to `never` after the
  // close-handler's null check (the spawn-error assignment lives in a callback).
  const spawnError: { err: Error | null } = { err: null };
  const start = Date.now();

  child.on("error", (err) => { spawnError.err = err; });
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString("utf8");
    if (responseLine !== null) return;
    for (const line of stdoutBuf.split("\n")) {
      try {
        const j = JSON.parse(line) as Record<string, unknown>;
        if (j["jsonrpc"] === "2.0" && j["id"] === 1) {
          responseLine = line;
          child.kill("SIGTERM");
          return;
        }
      } catch { /* not a complete JSON line yet */ }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString("utf8"); });

  child.stdin.write(initRequest);
  child.stdin.end();

  const killTimer = setTimeout(() => {
    if (responseLine === null) child.kill("SIGKILL");
  }, TIMEOUT_MS);

  await new Promise<void>((resolve) => child.on("close", () => resolve()));
  clearTimeout(killTimer);

  if (spawnError.err) {
    warn(`MCP smoke test failed: ${spawnError.err.message}`);
    return;
  }
  if (!responseLine) {
    const tail = stderrBuf.slice(-200).replace(/\s+$/, "");
    warn(`MCP smoke test: no valid JSON-RPC response within ${TIMEOUT_MS}ms (stderr_tail: ${tail})`);
    return;
  }

  const elapsed = Date.now() - start;
  try {
    const resp = JSON.parse(responseLine) as Record<string, unknown>;
    if (resp["result"]) {
      ok(`MCP smoke test passed — server responded to initialize in ${elapsed}ms`);
    } else if (resp["error"]) {
      warn(`MCP smoke test: server returned error: ${JSON.stringify(resp["error"])}`);
    } else {
      warn(`MCP smoke test: unexpected response shape`);
    }
  } catch (err) {
    warn(`MCP smoke test: could not parse response line: ${(err as Error).message}`);
  }
}

function printSummary(target: Target): void {
  const failed = results.filter((r) => r.status === "fail");
  const warned = results.filter((r) => r.status === "warn");

  console.log("");
  if (failed.length === 0) {
    console.log(`✅  Fulcrum global setup complete${DRY_RUN ? " (dry-run)" : ""}.`);
  } else {
    console.log(`⚠  Fulcrum setup finished with ${failed.length} failure(s).`);
  }
  console.log("");
  console.log("Installed:");
  const rows: Array<[string, string]> = [];
  if (target === "all" || target === "claude" || target === "gemini" || target === "pi") {
    rows.push(["fulcrum CLI", `~/.local/bin/fulcrum`]);
  }
  if (target === "all" || target === "claude") {
    rows.push(["Claude MCP server", `user scope — see: claude mcp list`]);
    rows.push(["Claude hooks (5)", `~/.claude/settings.json (PreToolUse, PostToolUse, SessionStart, Stop, PreCompact)`]);
    rows.push(["Claude global context", `~/.claude/CLAUDE.md (<!-- fulcrum:... --> section)`]);
    rows.push(["Claude Code skills", `~/.claude/skills/fulcrum/ (13 skill MDs)`]);
    rows.push(["Claude Code commands", `~/.claude/commands/ (fulcrum-status, fulcrum-task, fulcrum-memory, fulcrum-run)`]);
  }
  if (target === "all" || target === "gemini") {
    rows.push(["Gemini extension", `~/.gemini/extensions/fulcrum/`]);
  }
  if (target === "all" || target === "pi") {
    rows.push(["PI cockpit", `pi install ${path.join(REPO_ROOT, "agent-integration", "pi", "cockpit")}`]);
  }
  if (target === "all" || target === "codex") {
    rows.push(["Codex MCP (native)", `codex mcp add fulcrum`]);
    rows.push(["Codex skills", `~/.codex/skills/fulcrum-*/`]);
    rows.push(["Codex hooks", `~/.codex/config.toml [[hooks]]`]);
  }
  if (target === "all" || target === "opencode") {
    rows.push(["opencode plugin + hooks", `~/.opencode/ plugin`]);
  }
  const max = Math.max(...rows.map((r) => r[0].length));
  for (const [k, v] of rows) {
    console.log(`  • ${k}${" ".repeat(max - k.length)}  ${v}`);
  }

  if (warned.length > 0 || failed.length > 0) {
    console.log("");
    console.log("Issues:");
    for (const r of [...warned, ...failed]) {
      const icon = r.status === "fail" ? "❌" : "⚠";
      console.log(`  ${icon} ${r.name}: ${r.detail ?? ""}`);
      if (r.recovery) console.log(`     → ${r.recovery}`);
    }
  }

  // Rollback guide — only shown when at least one step failed
  if (failed.length > 0) {
    const rollbackable = results.filter((r) => r.status === "ok" && r.rollback);
    if (rollbackable.length > 0) {
      console.log("");
      console.log("To undo completed steps (run in reverse order):");
      for (const r of [...rollbackable].reverse()) {
        console.log(`  # undo: ${r.name}`);
        console.log(`  ${r.rollback}`);
      }
    }
  }

  console.log("");
  console.log("Next steps:");
  console.log("  fulcrum serve monitor      # start the dashboard");
  console.log("  fulcrum task list          # auto-init this project and list tasks");
  console.log("  fulcrum --help             # see all commands");
  console.log("  pnpm run setup:check       # verify install state any time");
  console.log("");
  console.log("Reopen your shell (or source your rc) if ~/.local/bin was just added to PATH.");
  console.log("Restart your agent CLI (Claude / Gemini / PI) to pick up changes.");
  console.log("");
}

async function main(): Promise<void> {
  // First positional arg that isn't a flag
  const positional = argv.find((a) => !a.startsWith("--")) ?? "all";
  const target = positional as Target;

  if (!HOME) {
    fail("HOME environment variable not set — cannot locate user config dirs");
    process.exit(1);
  }

  if (target === "check") {
    const rc = runCheck();
    process.exit(rc);
  }

  const plan = plans[target];
  if (!plan) {
    fail(`Unknown target: ${target}. Use one of: all | claude | gemini | pi | codex | opencode | check`);
    process.exit(1);
  }

  console.log(`\nFulcrum global installer — target: ${target}${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`Repo root: ${REPO_ROOT}`);
  console.log(`Home:      ${HOME}`);
  if (DRY_RUN) {
    console.log(`\n[dry-run] no files will be written, no commands executed.\n`);
  }

  for (const [name, fn] of plan) {
    await step(name, fn);
  }

  printSummary(target);

  const failures = results.filter((r) => r.status === "fail").length;
  process.exit(failures > 0 ? 1 : 0);
}

// ── Per-project init: Cursor ──────────────────────────────────────────────────
// Writes .cursor/mcp.json and .cursor/rules/fulcrum.mdc into targetDir.
// Idempotent: skips files that already exist.

export async function installCursor(opts: { dryRun: boolean; targetDir?: string }): Promise<void> {
  const targetDir = opts.targetDir ?? process.cwd();
  const dryRun = opts.dryRun;

  const REPO_ROOT_LOCAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const templateMcpJson = path.join(REPO_ROOT_LOCAL, "cursor", "mcp.json");
  const templateRulesMdc = path.join(REPO_ROOT_LOCAL, "cursor", "rules", "fulcrum.mdc");

  const destMcpDir = path.join(targetDir, ".cursor");
  const destMcpJson = path.join(destMcpDir, "mcp.json");
  const destRulesDir = path.join(targetDir, ".cursor", "rules");
  const destRulesMdc = path.join(destRulesDir, "fulcrum.mdc");

  // Write .cursor/mcp.json
  await step("Cursor: .cursor/mcp.json", () => {
    if (fs.existsSync(destMcpJson)) {
      skip(`already exists: ${destMcpJson}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destMcpJson}`);
      ok(`(dry-run) .cursor/mcp.json`);
      return;
    }
    fs.mkdirSync(destMcpDir, { recursive: true });
    fs.copyFileSync(templateMcpJson, destMcpJson);
    ok(`wrote ${destMcpJson}`);
    setRollback(`rm -f ${destMcpJson}`);
  });

  // Write .cursor/rules/fulcrum.mdc
  await step("Cursor: .cursor/rules/fulcrum.mdc", () => {
    if (fs.existsSync(destRulesMdc)) {
      skip(`already exists: ${destRulesMdc}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destRulesMdc}`);
      ok(`(dry-run) .cursor/rules/fulcrum.mdc`);
      return;
    }
    fs.mkdirSync(destRulesDir, { recursive: true });
    fs.copyFileSync(templateRulesMdc, destRulesMdc);
    ok(`wrote ${destRulesMdc}`);
    setRollback(`rm -f ${destRulesMdc}`);
  });
}

// ── Per-project init: Codex ───────────────────────────────────────────────────
// Uses Codex's native extension mechanisms:
//   1. `codex mcp add` — registers MCP server via the official CLI (writes to config.toml)
//   2. skills → ~/.codex/skills/fulcrum-*/  — global skills, always available
//   3. [[hooks]] in config.toml — the only standard way to wire lifecycle hooks
//   4. AGENTS.md → project root — project-level agent instructions

export async function installCodex(opts: { dryRun: boolean; targetDir?: string; globalHome?: string }): Promise<void> {
  const targetDir = opts.targetDir ?? process.cwd();
  const dryRun = opts.dryRun;
  const homeDir = opts.globalHome ?? (process.env["HOME"] ?? process.env["USERPROFILE"] ?? "");

  const REPO_ROOT_LOCAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const templateAgentsMd = path.join(REPO_ROOT_LOCAL, "codex", "AGENTS.md");
  const codexConfigDir = path.join(homeDir, ".codex");
  const codexConfigToml = path.join(codexConfigDir, "config.toml");
  const pluginSkillsDir = path.join(REPO_ROOT_LOCAL, "codex", "plugin", "skills");

  // 1. Register MCP server by merging TOML into config.toml directly. Codex CLI
  //    reads [mcp_servers.*] tables from this file on startup, so writing the
  //    entry is equivalent to `codex mcp add` and works even when the codex
  //    binary isn't installed (e.g. first-time install, test environments).
  const FULCRUM_MCP_TOML = [
    "",
    "[mcp_servers.fulcrum]",
    'command = "fulcrum"',
    'args = ["serve", "mcp", "--mode", "filtered"]',
    "",
  ].join("\n");

  await step("Codex: register fulcrum MCP → ~/.codex/config.toml", () => {
    if (dryRun) {
      console.log(`  [dry-run] would merge [mcp_servers.fulcrum] into ${codexConfigToml}`);
      ok(`(dry-run) mcp register`);
      return;
    }
    fs.mkdirSync(codexConfigDir, { recursive: true });
    const existing = fs.existsSync(codexConfigToml)
      ? fs.readFileSync(codexConfigToml, "utf8")
      : "";
    if (existing.includes("[mcp_servers.fulcrum]")) {
      skip(`fulcrum MCP already registered in ${codexConfigToml}`);
      return;
    }
    fs.writeFileSync(codexConfigToml, existing + FULCRUM_MCP_TOML, "utf8");
    ok(`registered fulcrum MCP in ${codexConfigToml}`);
  });

  // 2. Install skills into ~/.codex/skills/ via canonical source fanout (PR 6.4).
  //    Previously read 6 hand-authored skills from codex/plugin/skills/; those
  //    drifted from canonical so this step now invokes parseCanonicalSource +
  //    emitCodex to write all 33 skills to ~/.codex/skills/fulcrum-<name>/SKILL.md.
  //    The old plugin/skills/ directory is kept transiently for PR 14 plugin
  //    packaging but will be a symlink / removed in a follow-up cleanup.
  const codexSkillsDir = path.join(codexConfigDir, "skills");
  const agentIntegrationRoot = path.resolve(REPO_ROOT_LOCAL);
  void pluginSkillsDir; // retained for reference; no longer read at install time

  await step("Codex: install fulcrum skills → ~/.codex/skills/ (fanout)", () => {
    if (!fs.existsSync(path.join(agentIntegrationRoot, "skills"))) {
      skip(`no canonical skills dir at ${agentIntegrationRoot}/skills`);
      return;
    }
    const source = parseCanonicalSource({ agentIntegrationRoot });
    // emitCodex returns both skill + rule artifacts; skills land at
    // `skills/fulcrum-<name>/SKILL.md`, rules at `rules/fulcrum-rule-<name>.md`.
    // Split here so the rule-emit lands in its own step below.
    const skillArts = emitCodex(source).artifacts.filter(a => a.sourceSkillName);
    if (skillArts.length === 0) {
      skip(`emitCodex produced zero skill artifacts`);
      return;
    }
    if (dryRun) {
      ok(`(dry-run) ${skillArts.length} skill MDs → ${codexSkillsDir}`);
      return;
    }
    fs.mkdirSync(codexSkillsDir, { recursive: true });
    for (const art of skillArts) {
      // art.path is e.g. "skills/fulcrum-start-every-task/SKILL.md"; strip the
      // leading "skills/" since codexSkillsDir is already the target skills dir.
      const rel = art.path.startsWith("skills/") ? art.path.slice("skills/".length) : art.path;
      const dest = path.join(codexSkillsDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, art.contents, "utf8");
    }
    ok(`wrote ${skillArts.length} skill MD(s) → ${codexSkillsDir}`);
    setRollback(`rm -rf ${codexSkillsDir}`);
  });

  // 2b. Canonical rules → ~/.codex/rules/<name>.md. The UserPromptSubmit hook
  //     (PR 6.1) reads these verbatim and injects them as additional_context
  //     on every user turn. Filenames match loadCodexRider's lookup.
  const codexRulesDir = path.join(codexConfigDir, "rules");
  await step("Codex: install canonical rules → ~/.codex/rules/", () => {
    const srcRulesDir = path.join(agentIntegrationRoot, "rules");
    if (!fs.existsSync(srcRulesDir)) {
      skip(`no canonical rules dir at ${srcRulesDir}`);
      return;
    }
    const source = parseCanonicalSource({ agentIntegrationRoot });
    if (source.rules.length === 0) {
      skip(`canonical rules dir is empty`);
      return;
    }
    if (dryRun) {
      ok(`(dry-run) ${source.rules.length} rule(s) → ${codexRulesDir}`);
      return;
    }
    fs.mkdirSync(codexRulesDir, { recursive: true });
    for (const rule of source.rules) {
      fs.writeFileSync(path.join(codexRulesDir, `${rule.name}.md`), rule.raw, "utf8");
    }
    ok(`wrote ${source.rules.length} rule(s) → ${codexRulesDir}`);
    setRollback(`rm -rf ${codexRulesDir}`);
  });

  // 3. Wire lifecycle hooks into config.toml (hooks are config-level — no plugin API for this)
  const FULCRUM_HOOKS_MARKER = "fulcrum hook codex";
  const FULCRUM_HOOKS_ENTRY = [
    "",
    "# Fulcrum lifecycle hooks",
    "[[hooks]]",
    'event = "SessionStart"',
    'command = "fulcrum hook codex session-start"',
    "",
    "# PR 6.1 — canonical rider injection on every user turn.",
    "[[hooks]]",
    'event = "UserPromptSubmit"',
    'command = "fulcrum hook codex user-prompt-submit"',
    "",
    "# PR 6.2 — all-tool policy interceptor (PermissionRequest fires for",
    "# Write/Edit/MultiEdit/Task/Bash — unlike PreToolUse which is Bash-only).",
    "[[hooks]]",
    'event = "PermissionRequest"',
    'command = "fulcrum hook codex permission-request"',
    "",
    "[[hooks]]",
    'event = "PreToolUse"',
    'command = "fulcrum hook codex"',
    "",
    "[[hooks]]",
    'event = "PostToolUse"',
    'command = "fulcrum hook codex post"',
    "",
    "[[hooks]]",
    'event = "Stop"',
    'command = "fulcrum hook codex session-end"',
    "",
  ].join("\n");

  await step("Codex: lifecycle hooks → ~/.codex/config.toml", () => {
    if (dryRun) {
      console.log(`  [dry-run] would add SessionStart/PreToolUse/PostToolUse/Stop hooks`);
      ok(`(dry-run) hooks`);
      return;
    }
    fs.mkdirSync(codexConfigDir, { recursive: true });
    const existing = fs.existsSync(codexConfigToml)
      ? fs.readFileSync(codexConfigToml, "utf8")
      : "";
    if (existing.includes(FULCRUM_HOOKS_MARKER)) {
      skip(`fulcrum hooks already in ${codexConfigToml}`);
      return;
    }
    fs.writeFileSync(codexConfigToml, existing + FULCRUM_HOOKS_ENTRY, "utf8");
    ok(`wired SessionStart/PreToolUse/PostToolUse/Stop hooks`);
  });

  // 4. Write AGENTS.md to targetDir (project-level agent instructions for Codex)
  const destAgentsMd = path.join(targetDir, "AGENTS.md");

  await step("Codex: AGENTS.md", () => {
    if (fs.existsSync(destAgentsMd)) {
      skip(`already exists: ${destAgentsMd}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destAgentsMd}`);
      ok(`(dry-run) AGENTS.md`);
      return;
    }
    fs.copyFileSync(templateAgentsMd, destAgentsMd);
    ok(`wrote ${destAgentsMd}`);
    setRollback(`rm -f ${destAgentsMd}`);
  });

  // 5. Register in ~/.agents/plugins/marketplace.json (idempotent).
  //    Tracks which agent hosts have fulcrum installed — used by the plugin
  //    manifest to surface install status in the cockpit + for uninstall.
  const marketplaceDir = path.join(homeDir, ".agents", "plugins");
  const marketplacePath = path.join(marketplaceDir, "marketplace.json");

  await step("Codex: register plugin → ~/.agents/plugins/marketplace.json", () => {
    if (dryRun) {
      console.log(`  [dry-run] would register fulcrum plugin in ${marketplacePath}`);
      ok(`(dry-run) marketplace`);
      return;
    }
    fs.mkdirSync(marketplaceDir, { recursive: true });
    interface Marketplace {
      version?: number;
      plugins?: Array<{ name?: string; host?: string; version?: string; installed_at?: string }>;
      [k: string]: unknown;
    }
    let parsed: Marketplace = { version: 1, plugins: [] };
    if (fs.existsSync(marketplacePath)) {
      try {
        parsed = JSON.parse(fs.readFileSync(marketplacePath, "utf8")) as Marketplace;
      } catch {
        parsed = { version: 1, plugins: [] };
      }
    }
    if (!Array.isArray(parsed.plugins)) parsed.plugins = [];
    if (parsed.plugins.some(p => p?.name === "fulcrum" && p?.host === "codex")) {
      skip(`fulcrum already registered for codex in ${marketplacePath}`);
      return;
    }
    parsed.plugins.push({
      name: "fulcrum",
      host: "codex",
      version: "0.0.1",
      installed_at: new Date().toISOString(),
    });
    fs.writeFileSync(marketplacePath, JSON.stringify(parsed, null, 2), "utf8");
    ok(`registered fulcrum plugin in ${marketplacePath}`);
  });
}

// ── Per-project init: opencode ────────────────────────────────────────────────
// Writes .opencode/opencode.jsonc (JSONC config with MCP entry), the context
// doc, and slash commands into .opencode/command/.

export type OpencodeInstallMode = "auto" | "npm" | "local";

export const OPENCODE_PLUGIN_PKG = "@fulcrum-agent-os/opencode-plugin";

/**
 * Probe npm for the scoped plugin package with a short timeout. Runs
 * `npm view @fulcrum-agent-os/opencode-plugin version` 2s-bounded. Returns
 * the resolved version string on success, or null on miss / timeout /
 * unreachable registry. PR 4 c6 — feeds the dual-mode installOpencode
 * auto-detection.
 */
export function probeOpencodePluginOnNpm(timeoutMs = 2_000): string | null {
  const r = spawnSync("npm", ["view", OPENCODE_PLUGIN_PKG, "version"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (r.status !== 0) return null;
  const v = (r.stdout ?? "").trim();
  return v ? v : null;
}

/** Error thrown when --auto falls to --local AND local plugin file is absent. */
export class OpencodePluginUnresolvedError extends Error {
  readonly code = "opencode-plugin-unresolved";
  constructor(reason: string) {
    super(`opencode-plugin-unresolved: ${reason}`);
    this.name = "OpencodePluginUnresolvedError";
  }
}

export async function installOpencode(opts: {
  dryRun: boolean;
  targetDir?: string;
  mode?: OpencodeInstallMode;
}): Promise<void> {
  const targetDir = opts.targetDir ?? process.cwd();
  const dryRun = opts.dryRun;
  const requestedMode: OpencodeInstallMode = opts.mode
    ?? ((process.env["FULCRUM_OPENCODE_INSTALL_MODE"] as OpencodeInstallMode | undefined) ?? "auto");

  const REPO_ROOT_LOCAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const templateConfig = path.join(REPO_ROOT_LOCAL, "opencode", "opencode.jsonc");
  const templateDoc = path.join(REPO_ROOT_LOCAL, "opencode", "opencode.md");
  const templateCmdDir = path.join(REPO_ROOT_LOCAL, "opencode", "command");
  const templatePluginLocal = path.join(REPO_ROOT_LOCAL, "opencode", "plugins", "fulcrum.ts");

  const destDir = path.join(targetDir, ".opencode");
  const destConfig = path.join(destDir, "opencode.jsonc");
  const destDoc = path.join(destDir, "opencode.md");
  const destCmdDir = path.join(destDir, "command");

  // Resolve opencode.jsonc plugin reference up-front so we know which
  // template path to use and can fail loudly before mutating anything.
  //   auto  — npm probe wins; fall back to local on miss/timeout; throw
  //           opencode-plugin-unresolved if neither is reachable.
  //   npm   — require npm probe; no fallback; throw on miss.
  //   local — skip npm probe; require the local template file.
  let pluginRef: string;   // the string that lands in `"plugin": [...]`
  let resolvedVia: string; // human-readable diagnostic
  if (requestedMode === "local") {
    if (!fs.existsSync(templatePluginLocal)) {
      throw new OpencodePluginUnresolvedError(
        `mode=local but local plugin file missing at ${templatePluginLocal}`,
      );
    }
    pluginRef = "./plugins/fulcrum.ts";
    resolvedVia = "local (mode=local)";
  } else if (requestedMode === "npm") {
    const v = probeOpencodePluginOnNpm();
    if (!v) {
      throw new OpencodePluginUnresolvedError(
        `mode=npm but \`npm view ${OPENCODE_PLUGIN_PKG} version\` returned no version`,
      );
    }
    pluginRef = OPENCODE_PLUGIN_PKG;
    resolvedVia = `npm ${OPENCODE_PLUGIN_PKG}@${v}`;
  } else {
    // auto
    const v = probeOpencodePluginOnNpm();
    if (v) {
      pluginRef = OPENCODE_PLUGIN_PKG;
      resolvedVia = `npm ${OPENCODE_PLUGIN_PKG}@${v} (auto)`;
    } else if (fs.existsSync(templatePluginLocal)) {
      pluginRef = "./plugins/fulcrum.ts";
      resolvedVia = "local fallback (auto — npm probe missed)";
    } else {
      throw new OpencodePluginUnresolvedError(
        `mode=auto: npm probe missed AND local plugin file missing at ${templatePluginLocal}`,
      );
    }
  }

  await step(`opencode: plugin source resolved via ${resolvedVia}`, () => {
    ok(`plugin ref: ${pluginRef}`);
  });

  await step("opencode: .opencode/opencode.jsonc", () => {
    if (fs.existsSync(destConfig)) {
      skip(`already exists: ${destConfig}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destConfig}`);
      ok(`(dry-run) .opencode/opencode.jsonc`);
      return;
    }
    fs.mkdirSync(destDir, { recursive: true });
    // Rewrite the template's plugin line so the on-disk .opencode/opencode.jsonc
    // reflects the resolved plugin ref (npm package name or local path).
    // Preserves comments + other keys verbatim.
    const template = fs.readFileSync(templateConfig, "utf8");
    const rewritten = template.replace(
      /"plugin"\s*:\s*\[[^\]]*\]/,
      `"plugin": [${JSON.stringify(pluginRef)}]`,
    );
    fs.writeFileSync(destConfig, rewritten, "utf8");
    ok(`wrote ${destConfig} (plugin=${pluginRef})`);
    setRollback(`rm -f ${destConfig}`);
  });

  await step("opencode: .opencode/opencode.md", () => {
    if (fs.existsSync(destDoc)) {
      skip(`already exists: ${destDoc}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destDoc}`);
      ok(`(dry-run) .opencode/opencode.md`);
      return;
    }
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(templateDoc, destDoc);
    ok(`wrote ${destDoc}`);
    setRollback(`rm -f ${destDoc}`);
  });

  // Slash commands in .opencode/command/
  await step("opencode: .opencode/command/ (slash commands)", () => {
    if (!fs.existsSync(templateCmdDir)) {
      skip(`no command templates in ${templateCmdDir}`);
      return;
    }
    const cmdFiles = fs.readdirSync(templateCmdDir).filter((f) => f.endsWith(".md"));
    if (cmdFiles.length === 0) {
      skip(`no .md command templates found in ${templateCmdDir}`);
      return;
    }
    if (dryRun) {
      for (const f of cmdFiles) {
        console.log(`  [dry-run] would create ${path.join(destCmdDir, f)}`);
      }
      ok(`(dry-run) .opencode/command/ (${cmdFiles.length} commands)`);
      return;
    }
    fs.mkdirSync(destCmdDir, { recursive: true });
    let copied = 0;
    for (const f of cmdFiles) {
      const dest = path.join(destCmdDir, f);
      if (fs.existsSync(dest)) continue;
      fs.copyFileSync(path.join(templateCmdDir, f), dest);
      copied++;
    }
    if (copied === 0) {
      skip(`all ${cmdFiles.length} command(s) already exist in ${destCmdDir}`);
    } else {
      ok(`wrote ${copied} slash command(s) → ${destCmdDir}`);
      setRollback(`rm -f ${destCmdDir}/fulcrum-*.md`);
    }
  });

  // Plugin file — only copy locally when the resolved plugin ref points at
  // the in-repo `./plugins/fulcrum.ts`. When the ref is the npm package name
  // (`@fulcrum-agent-os/opencode-plugin`), opencode resolves via Bun's npm
  // cache at runtime and no local copy is needed.
  const templatePluginDir = path.join(REPO_ROOT_LOCAL, "opencode", "plugins");
  const destPluginDir = path.join(destDir, "plugins");
  const destPlugin = path.join(destPluginDir, "fulcrum.ts");
  const pluginModeLocal = pluginRef === "./plugins/fulcrum.ts";

  await step("opencode: .opencode/plugins/fulcrum.ts", () => {
    if (!pluginModeLocal) {
      skip(`plugin resolved via npm (${pluginRef}); skipping local copy`);
      return;
    }
    if (!fs.existsSync(path.join(templatePluginDir, "fulcrum.ts"))) {
      skip(`no plugin template at ${templatePluginDir}`);
      return;
    }
    if (fs.existsSync(destPlugin)) {
      skip(`already exists: ${destPlugin}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destPlugin}`);
      ok(`(dry-run) .opencode/plugins/fulcrum.ts`);
      return;
    }
    fs.mkdirSync(destPluginDir, { recursive: true });
    fs.copyFileSync(path.join(templatePluginDir, "fulcrum.ts"), destPlugin);
    ok(`wrote ${destPlugin}`);
    setRollback(`rm -f ${destPlugin}`);
  });

  // Also copy the rider.ts companion that fulcrum.ts imports.
  const destRider = path.join(destPluginDir, "rider.ts");
  await step("opencode: .opencode/plugins/rider.ts", () => {
    if (!pluginModeLocal) {
      skip(`plugin resolved via npm; rider.ts is bundled in the package`);
      return;
    }
    const src = path.join(templatePluginDir, "rider.ts");
    if (!fs.existsSync(src)) { skip(`no rider template at ${src}`); return; }
    if (fs.existsSync(destRider)) { skip(`already exists: ${destRider}`); return; }
    if (dryRun) { ok(`(dry-run) .opencode/plugins/rider.ts`); return; }
    fs.mkdirSync(destPluginDir, { recursive: true });
    fs.copyFileSync(src, destRider);
    ok(`wrote ${destRider}`);
    setRollback(`rm -f ${destRider}`);
  });

  // Canonical source fanout — AD-1 / AD-6. parseCanonicalSource reads every
  // skill + rule from `agent-integration/` and emit{Opencode,...} produces the
  // per-agent artifacts. installOpencode writes them to `.opencode/agents/` and
  // `.opencode/rules/` respectively, then the rider integrity SHA (AD-9a).
  const agentIntegrationRoot = REPO_ROOT_LOCAL;
  const destAgentsDir = path.join(destDir, "agents");
  const destRulesDir = path.join(destDir, "rules");

  await step("opencode: .opencode/agents/fulcrum-skill-<name>.md (fanout)", () => {
    if (!fs.existsSync(path.join(agentIntegrationRoot, "skills"))) {
      skip(`no canonical skills dir at ${agentIntegrationRoot}/skills`);
      return;
    }
    const source = parseCanonicalSource({ agentIntegrationRoot });
    // emitOpencode returns both skill + rule artifacts; we only want skills
    // here — rules land in the next step with canonical filenames so
    // loadRider / writeRidersum see the expected on-disk shape.
    const skillArts = emitOpencode(source).artifacts.filter((a) => a.sourceSkillName);
    if (skillArts.length === 0) {
      skip(`emitOpencode produced zero skill artifacts`);
      return;
    }
    if (dryRun) {
      ok(`(dry-run) ${skillArts.length} skill MDs → ${destAgentsDir}`);
      return;
    }
    fs.mkdirSync(destAgentsDir, { recursive: true });
    let written = 0;
    for (const art of skillArts) {
      // art.path is repo-relative (e.g. ".opencode/agents/fulcrum-skill-x.md");
      // targetDir is the install root, so join there, not at destDir
      // (destDir already includes the ".opencode" prefix).
      const dest = path.join(targetDir, art.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, art.contents, "utf8");
      written++;
    }
    ok(`wrote ${written} skill MD(s) → ${destAgentsDir}`);
    setRollback(`rm -f ${destAgentsDir}/fulcrum-skill-*.md`);
  });

  // Canonical rules copied verbatim (raw bodies — including frontmatter) into
  // .opencode/rules/. The plugin's loadRider (rider.ts) reads them raw and
  // verifies against the sibling .ridersum SHA-256 written next.
  await step("opencode: .opencode/rules/ (canonical rules)", () => {
    const srcRulesDir = path.join(agentIntegrationRoot, "rules");
    if (!fs.existsSync(srcRulesDir)) {
      skip(`no canonical rules dir at ${srcRulesDir}`);
      return;
    }
    const source = parseCanonicalSource({ agentIntegrationRoot });
    if (source.rules.length === 0) {
      skip(`canonical rules dir is empty`);
      return;
    }
    if (dryRun) {
      ok(`(dry-run) ${source.rules.length} rule(s) → ${destRulesDir}`);
      return;
    }
    fs.mkdirSync(destRulesDir, { recursive: true });
    for (const rule of source.rules) {
      const dest = path.join(destRulesDir, `${rule.name}.md`);
      fs.writeFileSync(dest, rule.raw, "utf8");
    }
    ok(`wrote ${source.rules.length} rule(s) → ${destRulesDir}`);
    setRollback(`rm -rf ${destRulesDir}`);
  });

  // .ridersum — SHA-256 companion for integrity verification at plugin load
  // (AD-9a). Must be computed over the same bytes loadRider reads.
  await step("opencode: .opencode/.ridersum (integrity)", () => {
    if (!fs.existsSync(destRulesDir)) {
      skip(`no rules dir at ${destRulesDir}`);
      return;
    }
    if (dryRun) {
      ok(`(dry-run) would write .ridersum`);
      return;
    }
    const result = writeRidersum(destRulesDir);
    if (result.sha256 === "") {
      skip(`rules dir has no .md files; .ridersum not written`);
      return;
    }
    ok(`wrote ${result.path} (sha256 ${result.sha256.slice(0, 12)}…, ${result.ruleCount} rule(s))`);
    setRollback(`rm -f ${result.path}`);
  });

  // 24 canonical role MDs — translate Claude frontmatter (name/description/model/
  // tools) to opencode's agent schema (description/mode/hidden) and write one
  // file per role at `.opencode/agents/<role>.md`. Chief_of_Staff + Orchestrator
  // land as `mode: primary` (L1/L2 orchestration); every other role is a
  // hidden subagent so Task() can dispatch to it without polluting @mention.
  const PRIMARY_ROLES = new Set(["chief_of_staff", "orchestrator"]);
  const sourceRolesDir = path.join(agentIntegrationRoot, "claude", "agents");
  await step("opencode: .opencode/agents/<role>.md (24 canonical roles)", () => {
    if (!fs.existsSync(sourceRolesDir)) {
      skip(`no canonical roles dir at ${sourceRolesDir}`);
      return;
    }
    const roleFiles = fs.readdirSync(sourceRolesDir)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));
    if (roleFiles.length === 0) {
      skip(`canonical roles dir is empty`);
      return;
    }
    if (dryRun) {
      ok(`(dry-run) ${roleFiles.length} role MD(s) → ${destAgentsDir}`);
      return;
    }
    fs.mkdirSync(destAgentsDir, { recursive: true });
    let written = 0;
    for (const file of roleFiles) {
      const slug = file.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(sourceRolesDir, file), "utf8");
      const translated = translateRoleForOpencode(raw, slug, PRIMARY_ROLES.has(slug));
      fs.writeFileSync(path.join(destAgentsDir, file), translated, "utf8");
      written++;
    }
    ok(`wrote ${written} role MD(s) → ${destAgentsDir}`);
    setRollback(`rm -f ${destAgentsDir}/*.md`);
  });
}

// Rewrite a Claude-flavored role MD to an opencode-flavored one. opencode's
// agent frontmatter needs `description` + `mode`; Claude sources carry
// `name`, `description`, `model`, `tools`. We keep `description` verbatim,
// pick mode from the caller (primary for chief_of_staff / orchestrator, else
// subagent + hidden), translate the `model` prefix, and drop the Claude-only
// tools.allowed/denied block (opencode has a different permission schema).
export function translateRoleForOpencode(raw: string, slug: string, primary: boolean): string {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const body = fmMatch ? fmMatch[2] ?? "" : raw;
  const fm = fmMatch ? (fmMatch[1] ?? "") : "";

  // Pull `description:` out of the YAML — accept both inline and `>-` folded
  // multi-line forms. Keep it simple: match the key then consume following
  // indented continuation lines until the next top-level key.
  const descMatch = fm.match(/^description:\s*>[-+]?\s*\n((?:(?:[ \t]+[^\n]*)\n?)+)|^description:\s*(.+?)(?=\n[^ \t]|$)/m);
  let description = "";
  if (descMatch) {
    if (descMatch[1]) {
      description = descMatch[1].split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
    } else if (descMatch[2]) {
      description = descMatch[2].trim();
    }
  }
  // YAML-escape quotes so the string round-trips safely.
  const descYaml = description.replace(/"/g, '\\"');

  // Pull `model:` (Claude uses bare IDs like "claude-sonnet-4-6"; opencode
  // uses provider-prefixed IDs like "anthropic/claude-sonnet-4-6").
  const modelMatch = fm.match(/^model:\s*(\S+)/m);
  const modelLine = modelMatch && modelMatch[1]
    ? `\nmodel: ${modelMatch[1].includes("/") ? modelMatch[1] : `anthropic/${modelMatch[1]}`}`
    : "";

  const modeLine = primary ? "mode: primary" : "mode: subagent\nhidden: true";
  const fmOut = `---\nname: ${slug}\ndescription: "${descYaml}"\n${modeLine}${modelLine}\n---\n`;
  return `${fmOut}${body.startsWith("\n") ? body : "\n" + body}`;
}

// ── Per-project init: Windsurf ────────────────────────────────────────────────
// Writes .windsurf/mcp.json and .windsurf/rules/fulcrum.mdc into targetDir.
// Idempotent: skips files that already exist.

export async function installWindsurf(opts: { dryRun: boolean; targetDir?: string }): Promise<void> {
  const targetDir = opts.targetDir ?? process.cwd();
  const dryRun = opts.dryRun;

  const REPO_ROOT_LOCAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const templateMcpJson = path.join(REPO_ROOT_LOCAL, "windsurf", "mcp.json");
  const templateRulesMdc = path.join(REPO_ROOT_LOCAL, "windsurf", "rules", "fulcrum.mdc");

  const destMcpDir = path.join(targetDir, ".windsurf");
  const destMcpJson = path.join(destMcpDir, "mcp.json");
  const destRulesDir = path.join(targetDir, ".windsurf", "rules");
  const destRulesMdc = path.join(destRulesDir, "fulcrum.mdc");

  // Write .windsurf/mcp.json
  await step("Windsurf: .windsurf/mcp.json", () => {
    if (fs.existsSync(destMcpJson)) {
      skip(`already exists: ${destMcpJson}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destMcpJson}`);
      ok(`(dry-run) .windsurf/mcp.json`);
      return;
    }
    fs.mkdirSync(destMcpDir, { recursive: true });
    fs.copyFileSync(templateMcpJson, destMcpJson);
    ok(`wrote ${destMcpJson}`);
    setRollback(`rm -f ${destMcpJson}`);
  });

  // Write .windsurf/rules/fulcrum.mdc
  await step("Windsurf: .windsurf/rules/fulcrum.mdc", () => {
    if (fs.existsSync(destRulesMdc)) {
      skip(`already exists: ${destRulesMdc}`);
      return;
    }
    if (dryRun) {
      console.log(`  [dry-run] would create ${destRulesMdc}`);
      ok(`(dry-run) .windsurf/rules/fulcrum.mdc`);
      return;
    }
    fs.mkdirSync(destRulesDir, { recursive: true });
    fs.copyFileSync(templateRulesMdc, destRulesMdc);
    ok(`wrote ${destRulesMdc}`);
    setRollback(`rm -f ${destRulesMdc}`);
  });
}

// ── Entry guard ───────────────────────────────────────────────────────────────
// Run main() only when executed as a script, not when imported as a module
// (e.g. from `fulcrum init` which imports installCursor / installWindsurf).

const _isEntry = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    const entryUrl = new URL(`file://${entry}`).href;
    return import.meta.url === entryUrl;
  } catch {
    return false;
  }
})();
if (_isEntry) main();
