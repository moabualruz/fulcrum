#!/usr/bin/env node
/**
 * Fulcrum agent integration installer.
 *
 * Usage:
 *   pnpm setup               # install all (claude + gemini + pi)
 *   pnpm setup:claude        # install Claude Code integration
 *   pnpm setup:gemini        # install Gemini CLI integration
 *   pnpm setup:pi            # install PI cockpit integration
 */

import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(msg: string) { console.log(`✓  ${msg}`); }
function warn(msg: string) { console.warn(`⚠   ${msg}`); }
function fail(msg: string) { console.error(`❌  ${msg}`); }

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p: string, data: unknown): void {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Copy src to dest only if dest doesn't exist yet. */
function copyOnce(src: string, dest: string, label: string): void {
  if (fs.existsSync(dest)) {
    warn(`${dest} already exists — skipping ${label} (remove to replace)`);
  } else {
    fs.copyFileSync(src, dest);
    ok(`Copied ${label} → ${dest}`);
  }
}

/** Merge { mcpServers: { fulcrum: ... } } into an existing .mcp.json. */
function mergeMcpJson(srcPath: string, destPath: string): void {
  const src = readJson(srcPath);
  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(srcPath, destPath);
    ok(`Copied .mcp.json → ${destPath}`);
    return;
  }
  const dest = readJson(destPath);
  const merged = {
    ...dest,
    mcpServers: { ...(dest["mcpServers"] as object ?? {}), ...(src["mcpServers"] as object ?? {}) },
  };
  writeJson(destPath, merged);
  ok(`Merged fulcrum MCP server into ${destPath}`);
}

/** Merge the Fulcrum PreToolUse hook into ~/.claude/settings.json. */
function mergeClaudeHook(snippetPath: string, settingsPath: string): void {
  const snippet = readJson(snippetPath);
  const hooks = (snippet["hooks"] as Record<string, unknown[]>)["PreToolUse"] as unknown[];
  const HOOK_COMMAND = "fulcrum hook claude";

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    settings = readJson(settingsPath);
  }

  const existing = ((settings["hooks"] as Record<string, unknown[]>)?.["PreToolUse"] ?? []) as unknown[];
  const alreadyInstalled = existing.some((entry) => {
    const e = entry as Record<string, unknown[]>;
    return (e["hooks"] ?? []).some((h) => (h as Record<string, unknown>)["command"] === HOOK_COMMAND);
  });

  if (alreadyInstalled) {
    ok(`Fulcrum hook already present in ${settingsPath}`);
    return;
  }

  settings["hooks"] = settings["hooks"] ?? {};
  (settings["hooks"] as Record<string, unknown[]>)["PreToolUse"] = [...existing, ...hooks];

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeJson(settingsPath, settings);
  ok(`Added Fulcrum PreToolUse hook → ${settingsPath}`);
}

// ── Fulcrum CLI check ─────────────────────────────────────────────────────────

function checkFulcrumCli(): boolean {
  try {
    execSync("fulcrum --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────

function installClaude(projectRoot: string): void {
  console.log("\n── Claude Code integration ──────────────────────────────────");

  if (!checkFulcrumCli()) {
    fail("'fulcrum' CLI not found. Install with: pnpm install-bin");
    process.exit(1);
  }

  const dir = path.join(__dirname, "claude");

  // .mcp.json
  mergeMcpJson(path.join(dir, ".mcp.json"), path.join(projectRoot, ".mcp.json"));

  // CLAUDE.md
  const claudeDir = path.join(projectRoot, ".claude");
  const claudeDest = fs.existsSync(claudeDir)
    ? path.join(claudeDir, "fulcrum.md")
    : path.join(projectRoot, "CLAUDE.md");
  copyOnce(path.join(dir, "CLAUDE.md"), claudeDest, "CLAUDE.md");

  // Hook → ~/.claude/settings.json
  mergeClaudeHook(
    path.join(dir, "settings-hooks-snippet.json"),
    path.join(process.env["HOME"] ?? "~", ".claude", "settings.json"),
  );

  console.log("\n✅  Claude Code integration installed.");
  console.log("   Restart Claude Code to pick up .mcp.json");
}

// ── Gemini ────────────────────────────────────────────────────────────────────

function installGemini(projectRoot: string): void {
  console.log("\n── Gemini CLI integration ───────────────────────────────────");

  if (!checkFulcrumCli()) {
    fail("'fulcrum' CLI not found. Install with: pnpm install-bin");
    process.exit(1);
  }

  const dir = path.join(__dirname, "gemini");

  // ~/.gemini/extensions/fulcrum/
  const extDir = path.join(process.env["HOME"] ?? "~", ".gemini", "extensions", "fulcrum");
  fs.mkdirSync(extDir, { recursive: true });
  fs.copyFileSync(path.join(dir, "gemini-extension.json"), path.join(extDir, "gemini-extension.json"));
  ok(`Installed extension → ${extDir}/gemini-extension.json`);

  // GEMINI.md
  const geminiDir = path.join(projectRoot, ".gemini");
  const geminiDest = fs.existsSync(geminiDir)
    ? path.join(geminiDir, "fulcrum.md")
    : path.join(projectRoot, "GEMINI.md");
  copyOnce(path.join(dir, "GEMINI.md"), geminiDest, "GEMINI.md");

  console.log("\n✅  Gemini CLI integration installed.");
  console.log("   Restart Gemini CLI to pick up the extension");
}

// ── PI ────────────────────────────────────────────────────────────────────────

function installPi(projectRoot: string): void {
  console.log("\n── PI coding agent integration ──────────────────────────────");

  if (!checkFulcrumCli()) {
    fail("'fulcrum' CLI not found. Install with: pnpm install-bin");
    process.exit(1);
  }

  const dir = path.join(__dirname, "pi");
  const cockpitDir = path.join(dir, "cockpit");

  // pi install ./cockpit
  const piResult = spawnSync("pi", ["install", cockpitDir], { stdio: "inherit", encoding: "utf8" });
  if (piResult.error || piResult.status !== 0) {
    if ((piResult.error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      warn("'pi' CLI not found — skipping cockpit install.");
      console.log(`   To install later: pi install ${cockpitDir}`);
      console.log("   MCP fallback: add fulcrum serve mcp to your PI MCP config");
    } else {
      fail(`pi install failed (status ${piResult.status ?? "unknown"})`);
    }
  } else {
    ok("Cockpit extension installed");
  }

  // PI.md
  const piConfigDir = path.join(projectRoot, ".pi");
  const piDest = fs.existsSync(piConfigDir)
    ? path.join(piConfigDir, "fulcrum.md")
    : path.join(projectRoot, "PI.md");
  copyOnce(path.join(dir, "PI.md"), piDest, "PI.md");

  console.log("\n✅  PI integration installed.");
  console.log("   Start PI — cockpit will prompt for workspace setup on first run");
  console.log("   Or run: /fulcrum-setup");
}

// ── Entry point ───────────────────────────────────────────────────────────────

const target = process.argv[2] ?? "all";
const projectRoot = process.argv[3] ?? process.cwd();

switch (target) {
  case "claude":
    installClaude(projectRoot);
    break;
  case "gemini":
    installGemini(projectRoot);
    break;
  case "pi":
    installPi(projectRoot);
    break;
  case "all":
    installClaude(projectRoot);
    installGemini(projectRoot);
    installPi(projectRoot);
    console.log("\n✅  All integrations installed.");
    console.log("   Start monitor: fulcrum serve all");
    break;
  default:
    fail(`Unknown target: ${target}. Use: claude | gemini | pi | all`);
    process.exit(1);
}
