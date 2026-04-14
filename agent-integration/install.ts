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
}
const results: StepResult[] = [];
let currentStep: StepResult | null = null;

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
  if (name.includes("Claude Code: global CLAUDE.md")) {
    return `manual: append agent-integration/claude/CLAUDE.md to ~/.claude/CLAUDE.md`;
  }
  if (name.includes("Claude Code: skills")) {
    return `manual: cp agent-integration/skills/*.md ~/.claude/skills/fulcrum/`;
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

// ── 3. Claude Code: PreToolUse hook → ~/.claude/settings.json ─────────────────

function installClaudeHook(): void {
  const settingsPath = path.join(HOME, ".claude", "settings.json");
  const HOOK_COMMAND = "fulcrum hook claude";

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
  const preToolUse = (hooks["PreToolUse"] as Array<Record<string, unknown>> | undefined) ?? [];

  const alreadyInstalled = preToolUse.some((entry) => {
    const list = (entry["hooks"] as Array<Record<string, unknown>> | undefined) ?? [];
    return list.some((h) => h["command"] === HOOK_COMMAND);
  });

  if (alreadyInstalled) {
    skip("PreToolUse hook already present");
    return;
  }

  preToolUse.push({
    matcher: "*",
    hooks: [{ type: "command", command: HOOK_COMMAND }],
  });
  hooks["PreToolUse"] = preToolUse;
  settings["hooks"] = hooks;

  writeJson(settingsPath, settings);
  ok(`added PreToolUse hook → ${settingsPath}`);
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
// Each file in agent-integration/skills/ gets copied to ~/.claude/skills/fulcrum/.
// Claude Code auto-loads user-scope skills from ~/.claude/skills/ at session start
// and surfaces them to the agent when the skill's `description` frontmatter field
// matches the current task. A namespaced subdirectory (`fulcrum/`) avoids
// collisions with other tool suites that install their own skills.

function installClaudeSkills(): void {
  const srcDir = path.join(REPO_ROOT, "agent-integration", "skills");
  if (!fs.existsSync(srcDir)) {
    warn(`skills source dir not found: ${srcDir}`);
    return;
  }
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    skip("no skill files to install");
    return;
  }

  const destDir = path.join(HOME, ".claude", "skills", "fulcrum");
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
  ok(`installed ${copied} skill file(s) → ${destDir}`);
}

// ── 6. Gemini CLI: user extension (~/.gemini/extensions/fulcrum/) ─────────────

function installGeminiExtension(): void {
  const extDir = path.join(HOME, ".gemini", "extensions", "fulcrum");
  const srcDir = path.join(REPO_ROOT, "agent-integration", "gemini");

  mkdirp(extDir);

  const files = [
    ["gemini-extension.json", "gemini-extension.json"],
    ["GEMINI.md", "GEMINI.md"],
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
      const pre = (hooks["PreToolUse"] as Array<Record<string, unknown>> | undefined) ?? [];
      const found = pre.some((entry) => {
        const list = (entry["hooks"] as Array<Record<string, unknown>> | undefined) ?? [];
        return list.some((h) => h["command"] === "fulcrum hook claude");
      });
      if (found) {
        rows.push({ label: "Claude hook", status: "ok", detail: `PreToolUse in ${settingsPath}` });
      } else {
        rows.push({ label: "Claude hook", status: "fail", detail: `no fulcrum PreToolUse in ${settingsPath}` });
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

  // Claude skills
  const skillsDir = path.join(HOME, ".claude", "skills", "fulcrum");
  const srcSkillsDir = path.join(REPO_ROOT, "agent-integration", "skills");
  if (fs.existsSync(skillsDir)) {
    const destFiles = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md")).length;
    const srcFiles = fs.existsSync(srcSkillsDir)
      ? fs.readdirSync(srcSkillsDir).filter((f) => f.endsWith(".md")).length
      : 0;
    if (srcFiles > 0 && destFiles >= srcFiles) {
      rows.push({ label: "Claude skills", status: "ok", detail: `${skillsDir} (${destFiles} files)` });
    } else {
      rows.push({
        label: "Claude skills",
        status: "warn",
        detail: `${skillsDir} (${destFiles}/${srcFiles} files — re-run setup:claude)`,
      });
    }
  } else {
    rows.push({ label: "Claude skills", status: "fail", detail: `${skillsDir} (missing — run setup:claude)` });
  }

  // Gemini extension
  const geminiDir = path.join(HOME, ".gemini", "extensions", "fulcrum");
  if (
    fs.existsSync(path.join(geminiDir, "gemini-extension.json")) &&
    fs.existsSync(path.join(geminiDir, "GEMINI.md"))
  ) {
    rows.push({ label: "Gemini extension", status: "ok", detail: geminiDir });
  } else if (fs.existsSync(geminiDir)) {
    rows.push({ label: "Gemini extension", status: "fail", detail: `${geminiDir} exists but missing files` });
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
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
    ["Claude Code: skills → ~/.claude/skills/fulcrum/", installClaudeSkills],
    ["Gemini CLI: user extension", installGeminiExtension],
    ["PI: cockpit extension", installPiCockpit],
  ],
  claude: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Claude Code: user-scope MCP server", installClaudeMcp],
    ["Claude Code: PreToolUse hook", installClaudeHook],
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
    ["Claude Code: skills → ~/.claude/skills/fulcrum/", installClaudeSkills],
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
    rows.push(["Claude PreToolUse hook", `~/.claude/settings.json`]);
    rows.push(["Claude global context", `~/.claude/CLAUDE.md (<!-- fulcrum:... --> section)`]);
    rows.push(["Claude Code skills", `~/.claude/skills/fulcrum/ (13 skill MDs)`]);
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
