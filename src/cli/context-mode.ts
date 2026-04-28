// Managed context-mode integration.
//
// Upstream: https://github.com/mksglu/context-mode
// Install contract, verified 2026-04-28:
// - Claude Code: plugin marketplace install
// - Gemini/Codex/OpenCode: global `context-mode` binary + MCP/hook config
// - Pi: global `context-mode` binary + `pi install npm:context-mode` + MCP config
// - Routing files are copied into each agent's rules file for model awareness.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AGENTS, type Agent } from "../agents/registry.ts";
import { cloneOrUpdate, run as runProc, which } from "../utils/proc.ts";

const CONTEXT_MODE_REPO = "https://github.com/mksglu/context-mode";
const TOML_BEGIN = "# BEGIN FULCRUM MCP context-mode";
const TOML_END = "# END FULCRUM MCP context-mode";
const RULES_BEGIN = "<!-- BEGIN FULCRUM CONTEXT-MODE -->";
const RULES_END = "<!-- END FULCRUM CONTEXT-MODE -->";

const CODEX_HOOKS = {
  PreToolUse: [{ hooks: [{ type: "command", command: "context-mode hook codex pretooluse" }] }],
  PostToolUse: [{ hooks: [{ type: "command", command: "context-mode hook codex posttooluse" }] }],
  SessionStart: [{ hooks: [{ type: "command", command: "context-mode hook codex sessionstart" }] }],
  UserPromptSubmit: [{ hooks: [{ type: "command", command: "context-mode hook codex userpromptsubmit" }] }],
  Stop: [{ hooks: [{ type: "command", command: "context-mode hook codex stop" }] }],
} as const;

const GEMINI_HOOKS = {
  BeforeTool: [{
    matcher: "run_shell_command|read_file|read_many_files|grep_search|search_file_content|web_fetch|activate_skill|mcp__plugin_context-mode",
    hooks: [{ type: "command", command: "context-mode hook gemini-cli beforetool" }],
  }],
  AfterTool: [{ matcher: "", hooks: [{ type: "command", command: "context-mode hook gemini-cli aftertool" }] }],
  PreCompress: [{ matcher: "", hooks: [{ type: "command", command: "context-mode hook gemini-cli precompress" }] }],
  SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "context-mode hook gemini-cli sessionstart" }] }],
} as const;

function fulcrumHome(home: string): string {
  return process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function readText(p: string): Promise<string> {
  return (await exists(p)) ? readFile(p, "utf8") : "";
}

async function writeText(p: string, body: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`     [dry-run] would write: ${p}`);
    return;
  }
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body);
}

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

function objectSection(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = root[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  root[key] = next;
  return next;
}

function arraySection(root: Record<string, unknown>, key: string): unknown[] {
  const current = root[key];
  if (Array.isArray(current)) return current;
  const next: unknown[] = [];
  root[key] = next;
  return next;
}

function commandOf(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const rec = entry as Record<string, unknown>;
  if (typeof rec["command"] === "string") return rec["command"];
  const hooks = rec["hooks"];
  if (!Array.isArray(hooks)) return null;
  for (const hook of hooks) {
    if (hook && typeof hook === "object" && typeof (hook as Record<string, unknown>)["command"] === "string") {
      return (hook as Record<string, unknown>)["command"] as string;
    }
  }
  return null;
}

function appendUniqueHook(root: Record<string, unknown>, event: string, entries: readonly unknown[]): boolean {
  const hooks = objectSection(root, "hooks");
  const target = arraySection(hooks, event);
  let changed = false;
  for (const entry of entries) {
    const command = commandOf(entry);
    const already = command ? target.some((existing) => commandOf(existing) === command) : false;
    if (!already) {
      target.push(entry);
      changed = true;
    }
  }
  return changed;
}

function removeContextModeHooks(root: Record<string, unknown>): boolean {
  const hooks = root["hooks"];
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return false;
  let changed = false;
  for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    const next = entries.filter((entry) => !(commandOf(entry) ?? "").startsWith("context-mode hook "));
    if (next.length !== entries.length) {
      (hooks as Record<string, unknown>)[event] = next;
      changed = true;
    }
  }
  return changed;
}

async function writeJson(file: string, root: Record<string, unknown>, dryRun: boolean): Promise<void> {
  await writeText(file, JSON.stringify(root, null, 2) + "\n", dryRun);
}

async function ensureContextModeBinary(dryRun: boolean): Promise<void> {
  if (await which("context-mode")) {
    console.log("     · context-mode binary already on PATH");
    return;
  }
  if (!(await which("npm"))) {
    console.log("     · skip npm global context-mode install (npm not on PATH)");
    return;
  }
  if (dryRun) {
    console.log("     [dry-run] would run: npm install -g context-mode");
    return;
  }
  const r = await runProc(["npm", "install", "-g", "context-mode"]);
  if (r.exit === 0) {
    console.log("     ✓ context-mode installed globally via npm");
  } else {
    console.log(`     ✗ npm install -g context-mode failed: ${r.stderr.trim()}`);
  }
}

async function cloneContextMode(home: string, dryRun: boolean, overrideDir?: string): Promise<string | null> {
  if (overrideDir) {
    console.log(`     · using context-mode source: ${overrideDir}`);
    return overrideDir;
  }
  const cloneDir = `${fulcrumHome(home)}/cache/context-mode`;
  if (dryRun) {
    console.log(`     [dry-run] would run: git clone/update ${CONTEXT_MODE_REPO} → ${cloneDir}`);
    return cloneDir;
  }
  const r = await cloneOrUpdate(CONTEXT_MODE_REPO, cloneDir);
  if (r.exit !== 0) {
    console.log(`     ✗ context-mode clone/update failed: ${r.stderr.trim()}`);
    return null;
  }
  return cloneDir;
}

function routingConfigPath(agent: Agent, cloneDir: string): string | null {
  switch (agent.id) {
    case "claude-code": return `${cloneDir}/configs/claude-code/CLAUDE.md`;
    case "codex": return `${cloneDir}/configs/codex/AGENTS.md`;
    case "gemini": return `${cloneDir}/configs/gemini-cli/GEMINI.md`;
    case "opencode": return `${cloneDir}/configs/opencode/AGENTS.md`;
    case "pi": return `${cloneDir}/configs/pi/AGENTS.md`;
  }
}

async function spliceContextModeRules(file: string, body: string, label: string, dryRun: boolean): Promise<void> {
  const existing = await readText(file);
  const managed = `${RULES_BEGIN}\n${body.trimEnd()}\n${RULES_END}`;
  if (existing.includes(RULES_BEGIN)) {
    const nb = (existing.match(new RegExp(RULES_BEGIN, "g")) ?? []).length;
    const ne = (existing.match(new RegExp(RULES_END, "g")) ?? []).length;
    if (nb !== 1 || ne !== 1) {
      console.log(`     ✗ ${label} context-mode rules refused: ${file} has ${nb} BEGIN / ${ne} END markers`);
      return;
    }
    const out = existing.replace(new RegExp(`${RULES_BEGIN}[\\s\\S]*?${RULES_END}`, "m"), managed);
    await writeText(file, out, dryRun);
    console.log(`     ↻ ${label} context-mode routing rules updated: ${file}`);
    return;
  }
  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  await writeText(file, `${existing}${sep}${managed}\n`, dryRun);
  console.log(`     ✓ ${label} context-mode routing rules installed: ${file}`);
}

async function removeContextModeRules(file: string, label: string, dryRun: boolean): Promise<void> {
  if (!(await exists(file))) {
    console.log(`     · ${label} context-mode rules file not present`);
    return;
  }
  const existing = await readText(file);
  if (!existing.includes(RULES_BEGIN)) {
    console.log(`     · ${label} context-mode rules not present`);
    return;
  }
  const out = existing
    .replace(new RegExp(`\\n?${RULES_BEGIN}[\\s\\S]*?${RULES_END}\\n?`, "m"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  await writeText(file, out ? `${out}\n` : "", dryRun);
  console.log(`     - ${label} context-mode routing rules removed: ${file}`);
}

async function installRoutingRules(home: string, cloneDir: string, dryRun: boolean): Promise<void> {
  for (const agent of AGENTS) {
    if (!(await isDir(agent.baseDir(home))) && !(await exists(agent.rulesFile(home)))) {
      console.log(`     · skip ${agent.label} context-mode rules (not detected)`);
      continue;
    }
    const src = routingConfigPath(agent, cloneDir);
    if (!src || (!dryRun && !(await exists(src)))) {
      console.log(`     · skip ${agent.label} context-mode rules (upstream config missing)`);
      continue;
    }
    const body = dryRun ? `# context-mode routing rules from ${src}` : await readFile(src, "utf8");
    await spliceContextModeRules(agent.rulesFile(home), body, agent.label, dryRun);
  }
}

async function installTomlBlock(file: string, dryRun: boolean): Promise<void> {
  const existing = await readText(file);
  if (existing.includes("[mcp_servers.context-mode]") || existing.includes(TOML_BEGIN)) {
    console.log(`     · Codex context-mode MCP already present: ${file}`);
    return;
  }
  const block = `${TOML_BEGIN}\n[mcp_servers.context-mode]\ncommand = "context-mode"\n${TOML_END}\n`;
  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  await writeText(file, `${existing}${sep}${block}`, dryRun);
  console.log(`     ✓ Codex context-mode MCP registered: ${file}`);
}

async function removeTomlBlock(file: string, dryRun: boolean): Promise<void> {
  if (!(await exists(file))) {
    console.log("     · Codex config not present");
    return;
  }
  const existing = await readText(file);
  if (!existing.includes(TOML_BEGIN)) {
    console.log("     · Codex context-mode MCP not Fulcrum-managed");
    return;
  }
  const out = existing
    .replace(new RegExp(`\\n?${TOML_BEGIN}[\\s\\S]*?${TOML_END}\\n?`, "m"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  await writeText(file, out ? `${out}\n` : "", dryRun);
  console.log(`     - Codex context-mode MCP removed: ${file}`);
}

async function installCodex(home: string, dryRun: boolean): Promise<void> {
  if (!(await isDir(`${home}/.codex`))) {
    console.log("     · skip Codex CLI context-mode (not detected)");
    return;
  }
  await installTomlBlock(`${home}/.codex/config.toml`, dryRun);
  const file = `${home}/.codex/hooks.json`;
  const root = await readJsonObject(file);
  if (!root) {
    console.log(`     ✗ Codex hooks config is not JSON; skipped: ${file}`);
    return;
  }
  let changed = false;
  for (const [event, entries] of Object.entries(CODEX_HOOKS)) {
    changed = appendUniqueHook(root, event, entries) || changed;
  }
  if (changed) await writeJson(file, root, dryRun);
  console.log(changed ? `     ✓ Codex context-mode hooks registered: ${file}` : `     · Codex context-mode hooks already present: ${file}`);
}

async function installGemini(home: string, dryRun: boolean): Promise<void> {
  if (!(await isDir(`${home}/.gemini`))) {
    console.log("     · skip Gemini CLI context-mode (not detected)");
    return;
  }
  const file = `${home}/.gemini/settings.json`;
  const root = await readJsonObject(file);
  if (!root) {
    console.log(`     ✗ Gemini settings is not JSON; skipped: ${file}`);
    return;
  }
  const mcp = objectSection(root, "mcpServers");
  let changed = false;
  if (!mcp["context-mode"]) {
    mcp["context-mode"] = { command: "context-mode" };
    changed = true;
  }
  for (const [event, entries] of Object.entries(GEMINI_HOOKS)) {
    changed = appendUniqueHook(root, event, entries) || changed;
  }
  if (changed) await writeJson(file, root, dryRun);
  console.log(changed ? `     ✓ Gemini context-mode registered: ${file}` : `     · Gemini context-mode already present: ${file}`);
}

async function installOpenCode(home: string, dryRun: boolean): Promise<void> {
  if (!(await isDir(`${home}/.config/opencode`))) {
    console.log("     · skip OpenCode context-mode (not detected)");
    return;
  }
  const file = `${home}/.config/opencode/opencode.json`;
  const root = await readJsonObject(file);
  if (!root) {
    console.log(`     ✗ OpenCode config is not JSON; skipped: ${file}`);
    return;
  }
  let changed = false;
  const mcp = objectSection(root, "mcp");
  if (!mcp["context-mode"]) {
    mcp["context-mode"] = { type: "local", command: ["context-mode"] };
    changed = true;
  }
  const plugin = arraySection(root, "plugin");
  if (!plugin.includes("context-mode")) {
    plugin.push("context-mode");
    changed = true;
  }
  if (changed) await writeJson(file, root, dryRun);
  console.log(changed ? `     ✓ OpenCode context-mode registered: ${file}` : `     · OpenCode context-mode already present: ${file}`);
}

async function installPi(home: string, dryRun: boolean, skipExternalCommands = false): Promise<void> {
  if (!(await isDir(`${home}/.pi/agent`))) {
    console.log("     · skip Pi CLI context-mode (not detected)");
    return;
  }
  if (skipExternalCommands) {
    console.log("     · skip pi install npm:context-mode");
  } else if (await which("pi")) {
    if (dryRun) console.log("     [dry-run] would run: pi install npm:context-mode");
    else {
      const r = await runProc(["pi", "install", "npm:context-mode"]);
      if (r.exit === 0) console.log("     ✓ Pi context-mode package install requested");
      else console.log(`     ✗ Pi context-mode package install failed: ${r.stderr.trim()}`);
    }
  } else {
    console.log("     · skip pi install npm:context-mode (pi not on PATH)");
  }

  const settingsFile = `${home}/.pi/agent/settings.json`;
  const settings = await readJsonObject(settingsFile);
  if (!settings) {
    console.log(`     ✗ Pi settings is not JSON; skipped package entry: ${settingsFile}`);
  } else {
    const packages = arraySection(settings, "packages");
    if (!packages.includes("npm:context-mode")) {
      packages.push("npm:context-mode");
      await writeJson(settingsFile, settings, dryRun);
      console.log(`     ✓ Pi context-mode package registered: ${settingsFile}`);
    } else {
      console.log(`     · Pi context-mode package already present: ${settingsFile}`);
    }
  }

  const mcpFile = `${home}/.pi/agent/mcp.json`;
  const mcpRoot = await readJsonObject(mcpFile);
  if (!mcpRoot) {
    console.log(`     ✗ Pi MCP config is not JSON; skipped: ${mcpFile}`);
    return;
  }
  const servers = objectSection(mcpRoot, "mcpServers");
  if (!servers["context-mode"]) {
    servers["context-mode"] = { command: "context-mode" };
    await writeJson(mcpFile, mcpRoot, dryRun);
    console.log(`     ✓ Pi context-mode MCP registered: ${mcpFile}`);
  } else {
    console.log(`     · Pi context-mode MCP already present: ${mcpFile}`);
  }
}

async function installClaude(home: string, dryRun: boolean, skipExternalCommands = false): Promise<void> {
  if (!(await isDir(`${home}/.claude`))) {
    console.log("     · skip Claude Code context-mode (not detected)");
    return;
  }
  if (skipExternalCommands) {
    console.log("     · skip Claude Code context-mode plugin install");
    return;
  }
  if (!(await which("claude"))) {
    console.log("     · skip Claude Code context-mode plugin (claude not on PATH) — manual: /plugin marketplace add mksglu/context-mode; /plugin install context-mode@context-mode");
    return;
  }
  if (dryRun) {
    console.log("     [dry-run] would run: claude plugin marketplace add mksglu/context-mode");
    console.log("     [dry-run] would run: claude plugin install context-mode@context-mode");
    return;
  }
  const r1 = await runProc(["claude", "plugin", "marketplace", "add", "mksglu/context-mode"]);
  if (r1.exit !== 0) {
    console.log(`     ✗ Claude Code context-mode marketplace add failed: ${r1.stderr.trim()}`);
    return;
  }
  const r2 = await runProc(["claude", "plugin", "install", "context-mode@context-mode"]);
  if (r2.exit !== 0) {
    console.log(`     ✗ Claude Code context-mode plugin install failed: ${r2.stderr.trim()}`);
  } else {
    console.log("     ✓ Claude Code context-mode plugin install requested");
  }
}

async function removeJsonMcp(file: string, sectionName: "mcpServers" | "mcp", label: string, dryRun: boolean): Promise<void> {
  const root = await readJsonObject(file);
  if (!root) {
    console.log(`     · ${label} context-mode config not present or not JSON`);
    return;
  }
  const section = root[sectionName];
  if (!section || typeof section !== "object" || Array.isArray(section) || !(section as Record<string, unknown>)["context-mode"]) {
    console.log(`     · ${label} context-mode MCP not present`);
    return;
  }
  delete (section as Record<string, unknown>)["context-mode"];
  await writeJson(file, root, dryRun);
  console.log(`     - ${label} context-mode MCP removed: ${file}`);
}

async function uninstallCodex(home: string, dryRun: boolean): Promise<void> {
  await removeTomlBlock(`${home}/.codex/config.toml`, dryRun);
  const file = `${home}/.codex/hooks.json`;
  const root = await readJsonObject(file);
  if (!root) {
    console.log("     · Codex context-mode hooks not present or not JSON");
    return;
  }
  if (removeContextModeHooks(root)) {
    await writeJson(file, root, dryRun);
    console.log(`     - Codex context-mode hooks removed: ${file}`);
  } else {
    console.log("     · Codex context-mode hooks not present");
  }
}

async function uninstallGemini(home: string, dryRun: boolean): Promise<void> {
  const file = `${home}/.gemini/settings.json`;
  const root = await readJsonObject(file);
  if (!root) {
    console.log("     · Gemini context-mode config not present or not JSON");
    return;
  }
  let changed = false;
  const mcp = root["mcpServers"];
  if (mcp && typeof mcp === "object" && !Array.isArray(mcp) && (mcp as Record<string, unknown>)["context-mode"]) {
    delete (mcp as Record<string, unknown>)["context-mode"];
    changed = true;
  }
  changed = removeContextModeHooks(root) || changed;
  if (changed) {
    await writeJson(file, root, dryRun);
    console.log(`     - Gemini context-mode removed: ${file}`);
  } else {
    console.log("     · Gemini context-mode not present");
  }
}

async function uninstallOpenCode(home: string, dryRun: boolean): Promise<void> {
  const file = `${home}/.config/opencode/opencode.json`;
  const root = await readJsonObject(file);
  if (!root) {
    console.log("     · OpenCode context-mode config not present or not JSON");
    return;
  }
  let changed = false;
  const mcp = root["mcp"];
  if (mcp && typeof mcp === "object" && !Array.isArray(mcp) && (mcp as Record<string, unknown>)["context-mode"]) {
    delete (mcp as Record<string, unknown>)["context-mode"];
    changed = true;
  }
  const plugin = root["plugin"];
  if (Array.isArray(plugin) && plugin.includes("context-mode")) {
    root["plugin"] = plugin.filter((value) => value !== "context-mode");
    changed = true;
  }
  if (changed) {
    await writeJson(file, root, dryRun);
    console.log(`     - OpenCode context-mode removed: ${file}`);
  } else {
    console.log("     · OpenCode context-mode not present");
  }
}

async function uninstallPi(home: string, dryRun: boolean): Promise<void> {
  const settingsFile = `${home}/.pi/agent/settings.json`;
  const settings = await readJsonObject(settingsFile);
  if (settings) {
    const packages = settings["packages"];
    if (Array.isArray(packages) && packages.includes("npm:context-mode")) {
      settings["packages"] = packages.filter((value) => value !== "npm:context-mode");
      await writeJson(settingsFile, settings, dryRun);
      console.log(`     - Pi context-mode package entry removed: ${settingsFile}`);
    } else {
      console.log("     · Pi context-mode package entry not present");
    }
  } else {
    console.log("     · Pi settings not present or not JSON");
  }
  await removeJsonMcp(`${home}/.pi/agent/mcp.json`, "mcpServers", "Pi", dryRun);
}

async function uninstallClaude(home: string, dryRun: boolean, skipExternalCommands = false): Promise<void> {
  if (!(await exists(`${home}/.claude`))) {
    console.log("     · Claude Code context-mode not detected");
    return;
  }
  const cachePresent = await exists(`${home}/.claude/plugins/cache/context-mode`);
  const installedPlugins = await readText(`${home}/.claude/plugins/installed_plugins.json`);
  const registryPresent = installedPlugins.includes("context-mode@context-mode");
  if (!cachePresent && !registryPresent) {
    console.log("     · Claude Code context-mode plugin not present");
    return;
  }
  if (skipExternalCommands) {
    console.log("     · skip Claude Code context-mode plugin removal");
  } else if (await which("claude")) {
    if (dryRun) {
      console.log("     [dry-run] would run: claude plugin uninstall context-mode@context-mode");
    } else {
      const r = await runProc(["claude", "plugin", "uninstall", "context-mode@context-mode"]);
      if (r.exit === 0) console.log("     - Claude Code context-mode plugin uninstall requested");
      else console.log(`     · Claude Code plugin uninstall failed or unsupported: ${r.stderr.trim()}`);
    }
  } else {
    console.log("     · Claude Code context-mode plugin removal skipped (claude not on PATH)");
  }
}

export async function installContextMode(opts: { dryRun?: boolean; cloneDir?: string; skipBinaryInstall?: boolean; skipExternalCommands?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  if (opts.skipBinaryInstall) {
    console.log("     · skip context-mode binary install");
  } else {
    await ensureContextModeBinary(dryRun);
  }
  const cloneDir = await cloneContextMode(home, dryRun, opts.cloneDir);
  await installClaude(home, dryRun, opts.skipExternalCommands);
  await installCodex(home, dryRun);
  await installGemini(home, dryRun);
  await installOpenCode(home, dryRun);
  await installPi(home, dryRun, opts.skipExternalCommands);
  if (cloneDir) {
    await installRoutingRules(home, cloneDir, dryRun);
  } else {
    console.log("     · skip context-mode routing rules (clone unavailable)");
  }
}

export async function uninstallContextMode(opts: { dryRun?: boolean; skipExternalCommands?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  await uninstallClaude(home, dryRun, opts.skipExternalCommands);
  await uninstallCodex(home, dryRun);
  await uninstallGemini(home, dryRun);
  await uninstallOpenCode(home, dryRun);
  await uninstallPi(home, dryRun);
  for (const agent of AGENTS) {
    await removeContextModeRules(agent.rulesFile(home), agent.label, dryRun);
  }
  console.log("     · keep global npm package context-mode (upstream has no uninstall contract; remove manually with npm uninstall -g context-mode if desired)");
}
