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
    return `manual: claude mcp add --scope user fulcrum -- fulcrum serve mcp`;
  }
  if (name.includes("Claude Code: PreToolUse")) {
    return `edit ~/.claude/settings.json manually, see agent-integration/claude/settings-hooks-snippet.json`;
  }
  if (name.includes("Regenerate CLAUDE.md")) {
    return `manual: node --import tsx/esm scripts/gen-claude-md.ts`;
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

function installClaudeMcp(): void {
  // Primary: use `claude mcp add --scope user` if available
  if (commandExists("claude")) {
    if (DRY_RUN) {
      dry(`would run: claude mcp remove --scope user fulcrum`);
      dry(`would run: claude mcp add --scope user fulcrum -- fulcrum serve mcp`);
      ok(`(dry-run) Claude MCP registration`);
      return;
    }
    // Remove any existing entry first so re-running setup is idempotent
    spawnSync("claude", ["mcp", "remove", "--scope", "user", "fulcrum"], {
      stdio: "ignore",
    });
    const result = spawnSync(
      "claude",
      ["mcp", "add", "--scope", "user", "fulcrum", "--", "fulcrum", "serve", "mcp"],
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
  mcpServers["fulcrum"] = { command: "fulcrum", args: ["serve", "mcp"] };
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

function installGeminiExtension(): void {
  const extDir = path.join(HOME, ".gemini", "extensions", "fulcrum");
  const srcDir = path.join(REPO_ROOT, "agent-integration", "gemini");

  mkdirp(extDir);
  // hooks/ subdirectory must exist inside the extension dir
  mkdirp(path.join(extDir, "hooks"));

  const files = [
    ["gemini-extension.json", "gemini-extension.json"],
    ["GEMINI.md", "GEMINI.md"],
    [path.join("hooks", "hooks.json"), path.join("hooks", "hooks.json")],
  ];
  for (const [src, dst] of files) {
    const from = path.join(srcDir, src);
    const to = path.join(extDir, dst);
    if (DRY_RUN) {
      dry(`would copy ${from} → ${to}`);
      continue;
    }
    fs.copyFileSync(from, to);
  }
  ok(`installed extension → ${extDir}`);
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

type Target = "all" | "claude" | "gemini" | "pi" | "check";

const plans: Record<Exclude<Target, "check">, Array<[string, () => void]>> = {
  all: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Claude Code: user-scope MCP server", installClaudeMcp],
    ["Claude Code: PreToolUse hook", installClaudeHook],
    ["Regenerate CLAUDE.md from TOOL_SCHEMAS", regenerateClaudeMd],
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
    ["Claude Code: skills → ~/.claude/skills/fulcrum/", installClaudeSkills],
    ["Claude Code: agent MDs → ~/.claude/agents/", installClaudeAgentMds],
    ["Claude Code: slash commands → ~/.claude/commands/", installClaudeCommands],
    ["Gemini CLI: user extension", installGeminiExtension],
    ["PI: cockpit extension", installPiCockpit],
    ["MCP smoke test", smokeMcp],
  ],
  claude: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Claude Code: user-scope MCP server", installClaudeMcp],
    ["Claude Code: PreToolUse hook", installClaudeHook],
    ["Regenerate CLAUDE.md from TOOL_SCHEMAS", regenerateClaudeMd],
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
    ["Claude Code: skills → ~/.claude/skills/fulcrum/", installClaudeSkills],
    ["Claude Code: agent MDs → ~/.claude/agents/", installClaudeAgentMds],
    ["Claude Code: slash commands → ~/.claude/commands/", installClaudeCommands],
    ["MCP smoke test", smokeMcp],
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
};

// ── Post-install MCP smoke test ───────────────────────────────────────────────
// Spawns `fulcrum serve mcp`, sends JSON-RPC `initialize`, verifies a valid
// response within a 5-second timeout. Non-blocking: failure is a warning.

async function smokeMcp(): Promise<void> {
  if (DRY_RUN) {
    dry("would run MCP smoke test: fulcrum serve mcp + initialize request");
    ok("(dry-run) smoke test skipped");
    return;
  }
  if (!commandExists("fulcrum")) {
    warn("smoke test skipped — fulcrum not in PATH");
    return;
  }
  const TIMEOUT_MS = 5000;
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

  try {
    const child = spawnSync(
      "fulcrum",
      ["serve", "mcp"],
      {
        input: initRequest,
        timeout: TIMEOUT_MS,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    if (child.error) throw child.error;

    const stdout = (child.stdout ?? "").trim();
    // Find the first line that looks like a JSON-RPC response
    const responseLine = stdout.split("\n").find((l) => {
      try { const j = JSON.parse(l) as Record<string, unknown>; return j["jsonrpc"] === "2.0" && j["id"] === 1; }
      catch { return false; }
    });

    if (!responseLine) {
      warn(`MCP smoke test: no valid JSON-RPC response found (stdout: ${stdout.slice(0, 200)})`);
      return;
    }

    const resp = JSON.parse(responseLine) as Record<string, unknown>;
    if (resp["result"]) {
      ok(`MCP smoke test passed — server responded to initialize`);
    } else if (resp["error"]) {
      warn(`MCP smoke test: server returned error: ${JSON.stringify(resp["error"])}`);
    } else {
      warn(`MCP smoke test: unexpected response shape`);
    }
  } catch (err) {
    warn(`MCP smoke test failed: ${(err as Error).message}`);
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
    fail(`Unknown target: ${target}. Use one of: all | claude | gemini | pi | check`);
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

main();
