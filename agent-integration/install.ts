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
 */

import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const HOME = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(msg: string): void { console.log(`  ✓ ${msg}`); }
function skip(msg: string): void { console.log(`  — ${msg}`); }
function warn(msg: string): void { console.warn(`  ⚠ ${msg}`); }
function fail(msg: string): void { console.error(`  ❌ ${msg}`); }

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
}

function writeJson(p: string, data: unknown): void {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function step(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n── ${name} ──────────────────────────────────`);
  return Promise.resolve().then(fn).catch((err: Error) => {
    fail(`${name}: ${err.message}`);
    process.exit(1);
  });
}

// ── 1. CLI bin (symlink ~/.local/bin/fulcrum) ─────────────────────────────────

function installCliBin(): void {
  const wrapperPath = path.join(REPO_ROOT, "fulcrum");
  if (!fs.existsSync(wrapperPath)) {
    throw new Error(`Wrapper script not found: ${wrapperPath}`);
  }

  const binDir = path.join(HOME, ".local", "bin");
  const linkPath = path.join(binDir, "fulcrum");

  fs.mkdirSync(binDir, { recursive: true });

  // Remove any existing symlink or file (including broken symlinks)
  try { fs.lstatSync(linkPath); fs.unlinkSync(linkPath); } catch { /* not present */ }

  fs.symlinkSync(wrapperPath, linkPath);
  ok(`linked ${wrapperPath} → ${linkPath}`);

  // Warn if ~/.local/bin is not in PATH
  const pathEnv = process.env["PATH"] ?? "";
  if (!pathEnv.split(":").includes(binDir)) {
    warn(`${binDir} is not in PATH. Add to your shell rc:`);
    console.log(`      export PATH="$HOME/.local/bin:$PATH"`);
  }
}

function verifyCliInPath(): void {
  try {
    const out = execSync("fulcrum --version 2>&1 || fulcrum memory --help 2>&1 | head -1", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    ok(`fulcrum resolves in PATH: ${out.split("\n")[0]}`);
  } catch {
    warn("`fulcrum` does not resolve in PATH yet — reopen your shell after setup");
  }
}

// ── 2. Claude Code: user-scope MCP server ─────────────────────────────────────

function installClaudeMcp(): void {
  // Primary: use `claude mcp add --scope user` if available
  if (commandExists("claude")) {
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

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

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

function installClaudeContext(): void {
  const globalPath = path.join(HOME, ".claude", "CLAUDE.md");
  const templatePath = path.join(REPO_ROOT, "agent-integration", "claude", "CLAUDE.md");

  if (!fs.existsSync(templatePath)) {
    throw new Error(`template not found: ${templatePath}`);
  }

  fs.mkdirSync(path.dirname(globalPath), { recursive: true });

  const MARKER_START = "<!-- fulcrum:begin -->";
  const MARKER_END = "<!-- fulcrum:end -->";
  const body = fs.readFileSync(templatePath, "utf8");
  const section = `${MARKER_START}\n${body.trimEnd()}\n${MARKER_END}\n`;

  let existing = "";
  if (fs.existsSync(globalPath)) {
    existing = fs.readFileSync(globalPath, "utf8");
  }

  // Strip any prior fulcrum section so re-runs update in place
  const regex = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, "g");
  existing = existing.replace(regex, "").trimEnd();

  const merged = existing ? `${existing}\n\n${section}` : section;
  fs.writeFileSync(globalPath, merged, "utf8");
  ok(`wrote Fulcrum section → ${globalPath}`);
}

// ── 5. Gemini CLI: user extension (~/.gemini/extensions/fulcrum/) ─────────────

function installGeminiExtension(): void {
  const extDir = path.join(HOME, ".gemini", "extensions", "fulcrum");
  const srcDir = path.join(REPO_ROOT, "agent-integration", "gemini");

  fs.mkdirSync(extDir, { recursive: true });

  fs.copyFileSync(
    path.join(srcDir, "gemini-extension.json"),
    path.join(extDir, "gemini-extension.json"),
  );
  fs.copyFileSync(
    path.join(srcDir, "GEMINI.md"),
    path.join(extDir, "GEMINI.md"),
  );
  ok(`installed extension → ${extDir}`);
}

// ── 6. PI: cockpit extension (pi install <cockpit>) ──────────────────────────

function installPiCockpit(): void {
  if (!commandExists("pi")) {
    warn("`pi` CLI not found — skipping cockpit install");
    const cockpitDir = path.join(REPO_ROOT, "agent-integration", "pi", "cockpit");
    console.log(`      To install later: pi install ${cockpitDir}`);
    return;
  }

  const cockpitDir = path.join(REPO_ROOT, "agent-integration", "pi", "cockpit");
  const result = spawnSync("pi", ["install", cockpitDir], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`\`pi install\` failed (status ${result.status ?? "unknown"})`);
  }
  ok("PI cockpit installed");
}

// ── Entry point ───────────────────────────────────────────────────────────────

type Target = "all" | "claude" | "gemini" | "pi";

const plans: Record<Target, Array<[string, () => void]>> = {
  all: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Claude Code: user-scope MCP server", installClaudeMcp],
    ["Claude Code: PreToolUse hook", installClaudeHook],
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
    ["Gemini CLI: user extension", installGeminiExtension],
    ["PI: cockpit extension", installPiCockpit],
  ],
  claude: [
    ["CLI symlink → ~/.local/bin/fulcrum", installCliBin],
    ["Verify fulcrum in PATH", verifyCliInPath],
    ["Claude Code: user-scope MCP server", installClaudeMcp],
    ["Claude Code: PreToolUse hook", installClaudeHook],
    ["Claude Code: global CLAUDE.md context", installClaudeContext],
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

async function main(): Promise<void> {
  const target = (process.argv[2] ?? "all") as Target;
  const plan = plans[target];
  if (!plan) {
    fail(`Unknown target: ${target}. Use one of: all | claude | gemini | pi`);
    process.exit(1);
  }

  if (!HOME) {
    fail("HOME environment variable not set — cannot locate user config dirs");
    process.exit(1);
  }

  console.log(`\nFulcrum global installer — target: ${target}`);
  console.log(`Repo root: ${REPO_ROOT}`);
  console.log(`Home:      ${HOME}`);

  for (const [name, fn] of plan) {
    await step(name, fn);
  }

  console.log("\n✅  Global setup complete.\n");
  console.log("Next steps:");
  console.log("  • Reopen your shell if 'fulcrum' was just added to PATH");
  console.log("  • Start the monitor in any project:  fulcrum serve monitor");
  console.log("  • Initialize per-project context:    fulcrum init");
  console.log("  • Restart your agent CLI (Claude / Gemini / PI) to pick up changes\n");
}

main();
