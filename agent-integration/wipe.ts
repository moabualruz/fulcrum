/**
 * PR 15 — `fulcrum install wipe`
 *
 * Per-agent wipe logic. Removes all Fulcrum-managed artifacts for a given
 * agent. Conservative strategy:
 *   - Fulcrum-exclusive files/dirs → delete
 *   - Shared config files (user may have added their own content) → surgical
 *     patch (strip MCP entry, strip hook entries, strip marker block)
 *   - Idempotent: re-running after a clean state is a no-op
 *   - Dry-run: reports planned actions without touching the filesystem
 */

import * as fs from "fs";
import * as path from "path";

// ── public types ───────────────────────────────────────────────────────────────

export type WipeAgentName =
  | "cursor"
  | "windsurf"
  | "codex"
  | "opencode"
  | "copilot"
  | "claude"
  | "gemini"
  | "pi";

export interface WipeAction {
  path: string;
  action: "delete" | "strip-marker" | "strip-mcp-entry" | "strip-hook-entries" | "strip-toml-section" | "skip";
  reason?: string;
}

export interface WipeResult {
  agent: WipeAgentName;
  dryRun: boolean;
  actions: WipeAction[];
  wiped: number;
  skipped: number;
}

export interface WipeOpts {
  agent: WipeAgentName;
  dryRun: boolean;
  /** Project directory (project-scoped agents: cursor, windsurf, opencode, copilot). Defaults to cwd. */
  targetDir?: string;
  /** Home directory (global-scoped agents: claude, gemini, codex, pi). Defaults to os.homedir(). */
  home?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

const MARKER_START = "<!-- fulcrum:begin -->";
const MARKER_END = "<!-- fulcrum:end -->";

function deleteFile(filePath: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(filePath)) {
    actions.push({ path: filePath, action: "skip", reason: "not found" });
    return;
  }
  actions.push({ path: filePath, action: "delete" });
  if (!dryRun) fs.rmSync(filePath, { force: true });
}

function deleteDir(dirPath: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(dirPath)) {
    actions.push({ path: dirPath, action: "skip", reason: "not found" });
    return;
  }
  actions.push({ path: dirPath, action: "delete" });
  if (!dryRun) fs.rmSync(dirPath, { recursive: true, force: true });
}

function deleteGlob(dir: string, pattern: RegExp, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!pattern.test(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      deleteDir(full, dryRun, actions);
    } else {
      deleteFile(full, dryRun, actions);
    }
  }
}

/** Strip all `<!-- fulcrum:begin --> … <!-- fulcrum:end -->` marker blocks from a file. */
function stripMarkerBlock(filePath: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(filePath)) {
    actions.push({ path: filePath, action: "skip", reason: "not found" });
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(MARKER_START)) {
    actions.push({ path: filePath, action: "skip", reason: "no marker block" });
    return;
  }
  actions.push({ path: filePath, action: "strip-marker" });
  if (dryRun) return;
  // Remove all blocks including surrounding newlines
  const stripped = content
    .replace(new RegExp(`\\n?${escapeRe(MARKER_START)}[\\s\\S]*?${escapeRe(MARKER_END)}\\n?`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
  fs.writeFileSync(filePath, stripped, "utf8");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove `mcpServers.<key>` from a JSON file.
 * If mcpServers becomes empty after removal, removes the key.
 * If the whole file has no remaining content beyond an empty object, deletes it.
 */
function stripMcpEntry(filePath: string, serverKey: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(filePath)) {
    actions.push({ path: filePath, action: "skip", reason: "not found" });
    return;
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    actions.push({ path: filePath, action: "skip", reason: "not valid JSON" });
    return;
  }
  const servers = obj["mcpServers"] as Record<string, unknown> | undefined;
  if (!servers || !(serverKey in servers)) {
    actions.push({ path: filePath, action: "skip", reason: "key not found" });
    return;
  }
  actions.push({ path: filePath, action: "strip-mcp-entry" });
  if (dryRun) return;
  delete servers[serverKey];
  if (Object.keys(servers).length === 0) {
    delete obj["mcpServers"];
  }
  // If the resulting object is empty (or only has empty mcpServers), delete the file
  const remaining = Object.keys(obj);
  if (remaining.length === 0) {
    fs.rmSync(filePath, { force: true });
  } else {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
  }
}

/**
 * Remove hook entries whose `command` field matches a predicate from a JSON
 * hooks file (`{ hooks: Array<{ event, command }> }`).
 */
function stripHookEntries(
  filePath: string,
  isFullcrum: (cmd: string) => boolean,
  dryRun: boolean,
  actions: WipeAction[],
): void {
  if (!fs.existsSync(filePath)) {
    actions.push({ path: filePath, action: "skip", reason: "not found" });
    return;
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    actions.push({ path: filePath, action: "skip", reason: "not valid JSON" });
    return;
  }
  const hooks = obj["hooks"] as Array<Record<string, unknown>> | undefined;
  if (!hooks) {
    actions.push({ path: filePath, action: "skip", reason: "no hooks key" });
    return;
  }
  const filtered = hooks.filter(h => !isFullcrum(String(h["command"] ?? "")));
  if (filtered.length === hooks.length) {
    actions.push({ path: filePath, action: "skip", reason: "no fulcrum hooks" });
    return;
  }
  actions.push({ path: filePath, action: "strip-hook-entries" });
  if (dryRun) return;
  obj["hooks"] = filtered;
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/**
 * Strip fulcrum hook [[hooks]] entries from a TOML config file.
 * Strategy: line-by-line scan; remove [[hooks]] blocks whose `command`
 * contains the fulcrum marker string.
 */
function stripTomlHooks(filePath: string, marker: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(filePath)) {
    actions.push({ path: filePath, action: "skip", reason: "not found" });
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(marker)) {
    actions.push({ path: filePath, action: "skip", reason: "marker not found" });
    return;
  }
  actions.push({ path: filePath, action: "strip-toml-section" });
  if (dryRun) return;

  // Split into [[hooks]] blocks and non-hook content; filter out fulcrum blocks.
  const lines = content.split("\n");
  const kept: string[] = [];
  let inHooksBlock = false;
  let blockLines: string[] = [];
  let blockIsFulcrum = false;

  function flushBlock(): void {
    if (!blockIsFulcrum) kept.push(...blockLines);
    blockLines = [];
    blockIsFulcrum = false;
    inHooksBlock = false;
  }

  for (const line of lines) {
    if (line.trim() === "[[hooks]]") {
      if (inHooksBlock) flushBlock();
      inHooksBlock = true;
      blockLines = [line];
    } else if (inHooksBlock) {
      // Detect start of a new top-level section → flush current block
      if (/^\s*\[(?!\[)/.test(line) || line.trim() === "[[hooks]]") {
        flushBlock();
        kept.push(line);
      } else {
        blockLines.push(line);
        if (line.includes(marker)) blockIsFulcrum = true;
      }
    } else {
      kept.push(line);
    }
  }
  if (inHooksBlock) flushBlock();

  fs.writeFileSync(filePath, kept.join("\n"), "utf8");
}

/**
 * Strip a TOML section by header (e.g. `[mcp_servers.fulcrum]`).
 * Removes from the section header line to the next section header.
 */
function stripTomlSection(filePath: string, sectionHeader: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(filePath)) {
    actions.push({ path: filePath, action: "skip", reason: "not found" });
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(sectionHeader)) {
    actions.push({ path: filePath, action: "skip", reason: "section not found" });
    return;
  }
  actions.push({ path: filePath, action: "strip-toml-section" });
  if (dryRun) return;

  const lines = content.split("\n");
  const kept: string[] = [];
  let inTarget = false;

  for (const line of lines) {
    if (line.trim() === sectionHeader) {
      inTarget = true;
      continue;
    }
    if (inTarget) {
      // New section header ([ or [[) ends the target block
      if (/^\s*\[/.test(line) && line.trim() !== "") {
        inTarget = false;
        kept.push(line);
      }
      // else skip line (it belongs to the target section)
    } else {
      kept.push(line);
    }
  }

  // Remove trailing blank lines left by the removal, then write
  const result = kept.join("\n").replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(filePath, result, "utf8");
}

/**
 * Remove hook entries from `settings["hooks"]` object in Claude's settings.json.
 * Each hook event (PreToolUse, PostToolUse, SessionStart, Stop, PreCompact) is an
 * array of `{ matcher?, hooks: [{ type, command }] }` entries.
 */
function stripClaudeHooks(settingsPath: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(settingsPath)) {
    actions.push({ path: settingsPath, action: "skip", reason: "not found" });
    return;
  }
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    actions.push({ path: settingsPath, action: "skip", reason: "not valid JSON" });
    return;
  }

  const hooks = settings["hooks"] as Record<string, unknown[]> | undefined;
  if (!hooks) {
    actions.push({ path: settingsPath, action: "skip", reason: "no hooks" });
    return;
  }

  let changed = false;
  for (const event of Object.keys(hooks)) {
    const entries = hooks[event] as Array<Record<string, unknown>>;
    const filtered = entries.filter(entry => {
      const innerHooks = (entry["hooks"] as Array<Record<string, unknown>> | undefined) ?? [];
      return !innerHooks.some(h => String(h["command"] ?? "").includes("fulcrum"));
    });
    if (filtered.length !== entries.length) {
      hooks[event] = filtered;
      changed = true;
    }
  }

  if (!changed) {
    actions.push({ path: settingsPath, action: "skip", reason: "no fulcrum hooks" });
    return;
  }
  actions.push({ path: settingsPath, action: "strip-hook-entries" });
  if (dryRun) return;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

/**
 * Strip the fulcrum plugin entry from `.opencode/opencode.jsonc`.
 * The file is treated as JSON (comments stripped for parse; written back as
 * plain JSON since we can't round-trip JSONC without a JSONC parser).
 */
function stripOpencodePlugin(filePath: string, dryRun: boolean, actions: WipeAction[]): void {
  if (!fs.existsSync(filePath)) {
    actions.push({ path: filePath, action: "skip", reason: "not found" });
    return;
  }
  let content = fs.readFileSync(filePath, "utf8");
  // Strip single-line // comments before JSON.parse
  const stripped = content.replace(/\/\/[^\n]*/g, "");
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    actions.push({ path: filePath, action: "skip", reason: "not valid JSONC" });
    return;
  }
  const plugin = obj["plugin"] as string[] | undefined;
  if (!plugin) {
    actions.push({ path: filePath, action: "skip", reason: "no plugin key" });
    return;
  }
  const filtered = plugin.filter(p => !p.includes("fulcrum") && !p.includes("opencode-plugin"));
  if (filtered.length === plugin.length) {
    actions.push({ path: filePath, action: "skip", reason: "no fulcrum plugin entry" });
    return;
  }
  actions.push({ path: filePath, action: "strip-mcp-entry" });
  if (dryRun) return;
  if (filtered.length === 0) {
    delete obj["plugin"];
  } else {
    obj["plugin"] = filtered;
  }
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// ── count helpers for WipeResult ──────────────────────────────────────────────

function countWiped(actions: WipeAction[]): number {
  return actions.filter(a => a.action !== "skip").length;
}

function countSkipped(actions: WipeAction[]): number {
  return actions.filter(a => a.action === "skip").length;
}

// ── per-agent wipe implementations ───────────────────────────────────────────

function wipeCursor(targetDir: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  const c = (rel: string) => path.join(targetDir, rel);

  // Exclusive fulcrum files — safe to delete
  deleteFile(c(".cursor/rules/fulcrum-core.mdc"), dryRun, actions);
  deleteGlob(c(".cursor/rules"), /^fulcrum-skill-.*\.mdc$/, dryRun, actions);
  deleteGlob(c(".cursor/skills"), /^fulcrum-/, dryRun, actions);
  deleteGlob(c(".cursor/commands"), /^fulcrum-.*\.md$/, dryRun, actions);

  // Shared files — surgical patch
  stripMcpEntry(c(".cursor/mcp.json"), "fulcrum", dryRun, actions);
  stripHookEntries(c(".cursor/hooks.json"), (cmd) => cmd.includes("fulcrum"), dryRun, actions);

  return actions;
}

function wipeWindsurf(targetDir: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  const c = (rel: string) => path.join(targetDir, rel);

  deleteFile(c(".windsurf/rules/fulcrum-core.md"), dryRun, actions);
  deleteGlob(c(".windsurf/rules"), /^fulcrum-skill-.*\.md$/, dryRun, actions);
  deleteGlob(c(".windsurf/workflows"), /^fulcrum-.*\.md$/, dryRun, actions);

  stripMcpEntry(c(".windsurf/mcp.json"), "fulcrum", dryRun, actions);
  stripHookEntries(c(".windsurf/hooks.json"), (cmd) => cmd.includes("fulcrum"), dryRun, actions);

  return actions;
}

function wipeCodex(home: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  const codexDir = path.join(home, ".codex");
  const configToml = path.join(codexDir, "config.toml");

  stripTomlSection(configToml, "[mcp_servers.fulcrum]", dryRun, actions);
  stripTomlHooks(configToml, "fulcrum hook codex", dryRun, actions);
  deleteGlob(path.join(codexDir, "skills"), /^fulcrum-/, dryRun, actions);
  deleteGlob(path.join(codexDir, "rules"), /^fulcrum-/, dryRun, actions);

  return actions;
}

function wipeOpencode(targetDir: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  const c = (rel: string) => path.join(targetDir, rel);

  stripOpencodePlugin(c(".opencode/opencode.jsonc"), dryRun, actions);
  deleteFile(c(".opencode/opencode.md"), dryRun, actions);
  deleteFile(c(".opencode/plugins/fulcrum.ts"), dryRun, actions);
  deleteFile(c(".opencode/plugins/rider.ts"), dryRun, actions);
  deleteGlob(c(".opencode/command"), /^fulcrum-.*\.md$/, dryRun, actions);
  deleteGlob(c(".opencode/agents"), /^fulcrum-/, dryRun, actions);
  deleteGlob(c(".opencode/rules"), /^fulcrum-/, dryRun, actions);

  return actions;
}

function wipeCopilot(targetDir: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  const c = (rel: string) => path.join(targetDir, rel);

  // Exclusive fulcrum files
  deleteGlob(c(".github/instructions"), /^fulcrum-skill-.*\.instructions\.md$/, dryRun, actions);
  deleteGlob(c(".github/agents"), /\.agent\.md$/, dryRun, actions);
  deleteFile(c(".github/hooks/fulcrum.json"), dryRun, actions);

  // Shared files — surgical patch
  stripMcpEntry(c(".mcp.json"), "fulcrum", dryRun, actions);
  stripMarkerBlock(c(".github/copilot-instructions.md"), dryRun, actions);
  stripMarkerBlock(c("AGENTS.md"), dryRun, actions);

  return actions;
}

function wipeClaude(home: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  const claudeDir = path.join(home, ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");
  // ~/.claude.json is where `claude mcp add --scope user` writes MCP entries
  const claudeJsonPath = path.join(home, ".claude.json");

  // Shared config — surgical
  stripClaudeHooks(settingsPath, dryRun, actions);
  stripMcpEntry(settingsPath, "fulcrum", dryRun, actions);
  stripMcpEntry(claudeJsonPath, "fulcrum", dryRun, actions);
  stripMarkerBlock(path.join(claudeDir, "CLAUDE.md"), dryRun, actions);

  // Exclusive fulcrum dirs/files
  deleteDir(path.join(claudeDir, "skills", "fulcrum"), dryRun, actions);
  deleteGlob(path.join(claudeDir, "agents"), /^fulcrum-/, dryRun, actions);
  deleteGlob(path.join(claudeDir, "commands"), /^fulcrum-/, dryRun, actions);

  return actions;
}

function wipeGemini(home: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  deleteDir(path.join(home, ".gemini", "extensions", "fulcrum"), dryRun, actions);
  return actions;
}

function wipePi(home: string, dryRun: boolean): WipeAction[] {
  const actions: WipeAction[] = [];
  deleteDir(path.join(home, ".pi", "packages", "@fulcrum-agent-os", "pi-cockpit"), dryRun, actions);
  return actions;
}

// ── public entry point ────────────────────────────────────────────────────────

export function wipeAgent(opts: WipeOpts): WipeResult {
  const {
    agent,
    dryRun,
    targetDir = process.cwd(),
    home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "",
  } = opts;

  let actions: WipeAction[];

  switch (agent) {
    case "cursor":   actions = wipeCursor(targetDir, dryRun);   break;
    case "windsurf": actions = wipeWindsurf(targetDir, dryRun); break;
    case "codex":    actions = wipeCodex(home, dryRun);         break;
    case "opencode": actions = wipeOpencode(targetDir, dryRun); break;
    case "copilot":  actions = wipeCopilot(targetDir, dryRun);  break;
    case "claude":   actions = wipeClaude(home, dryRun);        break;
    case "gemini":   actions = wipeGemini(home, dryRun);        break;
    case "pi":       actions = wipePi(home, dryRun);            break;
    default: {
      const _exhaustive: never = agent;
      throw new Error(`wipeAgent: unknown agent "${String(_exhaustive)}"`);
    }
  }

  return {
    agent,
    dryRun,
    actions,
    wiped: countWiped(actions),
    skipped: countSkipped(actions),
  };
}
