// fulcrum uninstall: remove Fulcrum-managed install artifacts.
//
// Conservative by default: remove sentinel-spliced rules, managed skill
// namespaces, hook snippets/markers, generated Gemini import lines, and MCP
// registry entries. Leave user-edited policy files and third-party caveman
// installs alone unless an explicit flag says otherwise.

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AGENTS } from "@execution-orchestration/interface/agent-catalog.ts";
import { which, run as runProc } from "@platform-core/application/runtime-support/process-runner.ts";

const BEGIN = "<!-- BEGIN FULCRUM RULES -->";
const END = "<!-- END FULCRUM RULES -->";

let DRY_RUN = false;

export function setDryRun(v: boolean): void {
  DRY_RUN = v;
}

function repoRoot(): string {
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? `${process.env["HOME"]}/.fulcrum`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function wf(path: string, data: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`     [dry-run] would write: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

async function removePath(path: string, label: string): Promise<void> {
  if (!(await exists(path))) {
    console.log(`     · ${label} not present`);
    return;
  }
  if (DRY_RUN) {
    console.log(`     [dry-run] would remove: ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
  console.log(`     - ${label} → ${path}`);
}

async function removeEmptyDir(path: string, label: string): Promise<void> {
  if (!(await exists(path))) return;
  let entries: string[];
  try {
    entries = await readdir(path);
  } catch {
    return;
  }
  if (entries.length > 0) {
    console.log(`     · keep ${label} (not empty)`);
    return;
  }
  await removePath(path, label);
}

function cavemanMirrorMarkerPath(home: string): string {
  return `${process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`}/state/global/caveman-mirrors.installed`;
}

async function hasCavemanMirrorMarker(home: string): Promise<boolean> {
  return exists(cavemanMirrorMarkerPath(home));
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | null> {
  if (!(await exists(path))) return {};
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isEmptyObject(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).length === 0;
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

async function writeOrRemoveJson(path: string, root: Record<string, unknown>, label: string): Promise<void> {
  if (Object.keys(root).length === 0) {
    await removePath(path, label);
    return;
  }
  await wf(path, JSON.stringify(root, null, 2) + "\n");
  console.log(`     - ${label} cleaned → ${path}`);
}

function normalizeAfterBlockRemoval(text: string): string {
  const compact = text.replace(/\n{3,}/g, "\n\n").trimEnd();
  return compact ? compact + "\n" : "";
}

function removeTomlSection(existing: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)${escaped}\\n[\\s\\S]*?(?=\\n\\[|$)`);
  return existing.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function removeSentinelBlock(target: string, label: string): Promise<void> {
  if (!(await exists(target))) {
    console.log(`     · ${label} rules file not present`);
    return;
  }

  const existing = await readFile(target, "utf8");
  const nb = (existing.match(new RegExp(BEGIN, "g")) ?? []).length;
  const ne = (existing.match(new RegExp(END, "g")) ?? []).length;
  if (nb === 0 && ne === 0) {
    console.log(`     · ${label} has no Fulcrum rules block`);
    return;
  }
  if (nb !== 1 || ne !== 1) {
    console.log(`     ✗ ${label} refused: ${target} has ${nb} BEGIN / ${ne} END markers (expected 1/1). Fix manually.`);
    return;
  }

  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END) + END.length;
  let before = existing.slice(0, start);
  let after = existing.slice(end);
  if (before.endsWith("\n") && after.startsWith("\n")) {
    after = after.slice(1);
  }
  const out = normalizeAfterBlockRemoval(before + after);
  await wf(target, out);
  console.log(`     - ${label} rules block → ${target}`);
}

export async function removeExactLine(target: string, line: string, label: string): Promise<void> {
  if (!(await exists(target))) {
    console.log(`     · ${label} not present`);
    return;
  }
  const existing = await readFile(target, "utf8");
  const lines = existing.split(/\r?\n/);
  const next = lines.filter((l) => l.trim() !== line).join("\n").replace(/\n+$/, "");
  const out = next ? next + "\n" : "";
  if (out === existing) {
    console.log(`     · ${label} line not present`);
    return;
  }
  await wf(target, out);
  console.log(`     - ${label} line removed → ${target}`);
}

async function removePolicy(purge: boolean): Promise<void> {
  const dst = `${fulcrumHome()}/tool-output-policy.toml`;
  if (!(await exists(dst))) {
    console.log("     · tool-output policy not present");
    return;
  }

  if (purge) {
    await removePath(dst, "tool-output policy");
    return;
  }

  const src = `${repoRoot()}/config/tool-output-policy.toml`;
  if (!(await exists(src))) {
    console.log(`     · keep policy (cannot compare without ${src})`);
    return;
  }

  const current = await readFile(dst, "utf8");
  const shipped = await readFile(src, "utf8");
  if (current !== shipped) {
    console.log(`     · keep policy (modified): ${dst}`);
    return;
  }
  await removePath(dst, "unmodified tool-output policy");
}

export async function removeRulesBlocks(home: string, dryRun = false): Promise<void> {
  const previousDryRun = DRY_RUN;
  DRY_RUN = dryRun;
  try {
    for (const agent of AGENTS) {
      await removeSentinelBlock(agent.rulesFile(home), agent.label);
    }
  } finally {
    DRY_RUN = previousDryRun;
  }
}

export async function removeToolOutputPolicy(purge: boolean, dryRun = false): Promise<void> {
  const previousDryRun = DRY_RUN;
  DRY_RUN = dryRun;
  try {
    await removePolicy(purge);
  } finally {
    DRY_RUN = previousDryRun;
  }
}

/**
 * Run a command best-effort: log + continue on failure, never throw.
 * Skips in dry-run mode.
 */
async function runBestEffort(cmd: string[], label: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`     [dry-run] would run: ${cmd.join(" ")}`);
    return;
  }
  const r = await runProc(cmd);
  if (r.exit !== 0) {
    console.log(`     · ${label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()}: continuing`);
  } else {
    console.log(`     ✓ ${label}`);
  }
}

async function removeSkillNamespaces(home: string): Promise<void> {
  // W1.6: Before removing the fulcrum-upstream namespace for Claude Code,
  // uninstall any upstream skills that were installed via `claude plugin`.
  // Load the lockfile and call `claude plugin uninstall <name>` for each entry
  // with a claude_plugin field. Best-effort: log + continue.
  const claudeDir = `${home}/.claude`;
  if (await exists(claudeDir) && (await which("claude"))) {
    // Marker-gated uninstall: only run `claude plugin uninstall` when Fulcrum
    // wrote the corresponding ownership marker. Without it, print the manual
    // command and leave Claude state alone: touching plugins Fulcrum did not
    // install can log the user out of their Claude account.
    const { safeClaudePluginUninstall } = await import("./claude-plugin-markers.ts");
    const fulcrumPluginResult = await safeClaudePluginUninstall("fulcrum@fulcrum", { dryRun: DRY_RUN });
    if (!fulcrumPluginResult.ran) {
      console.log(`     · Claude Code fulcrum plugin: ${fulcrumPluginResult.reason ?? "skipped"}: manual: claude plugin uninstall fulcrum@fulcrum`);
    } else if (!fulcrumPluginResult.ok) {
      console.log(`     · Claude Code fulcrum plugin uninstall failed (exit ${fulcrumPluginResult.exit}): ${fulcrumPluginResult.stderr?.trim() ?? ""}`);
    } else {
      console.log("     ✓ Claude Code fulcrum plugin uninstalled");
    }

    try {
      const { loadUpstreamSkills } = await import("./upstream-skills.ts");
      const repoRoot = process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
      const lockPath = `${repoRoot}/skills/upstream.lock`;
      const skills = await loadUpstreamSkills(lockPath);
      for (const skill of skills) {
        if (skill.claude_plugin) {
          const r = await safeClaudePluginUninstall(skill.claude_plugin.name, { dryRun: DRY_RUN });
          if (!r.ran) {
            console.log(`     · Claude Code ${skill.name} plugin: ${r.reason ?? "skipped"}: manual: claude plugin uninstall ${skill.claude_plugin.name}`);
          }
        }
      }
    } catch {
      // lockfile may not be present in all contexts: best-effort
    }
  }
  for (const agent of AGENTS) {
    if (agent.id === "gemini") {
      await removePath(`${home}/.gemini/extensions/fulcrum-skills`, "Gemini fulcrum-skills extension");
      await removePath(`${home}/.gemini/extensions/fulcrum-upstream-skills`, "Gemini fulcrum-upstream-skills extension");
      continue;
    }
    await removePath(`${agent.skillsDir(home)}/fulcrum`, `${agent.label} fulcrum skill namespace`);
    await removePath(`${agent.skillsDir(home)}/fulcrum-upstream`, `${agent.label} fulcrum-upstream skill namespace`);
  }
  await removeManagedUpstreamSkills();
}

async function removeManagedUpstreamSkills(): Promise<void> {
  try {
    const { removeUpstreamSkills } = await import("./upstream-skills.ts");
    await removeUpstreamSkills({
      dryRun: DRY_RUN,
      lockPath: `${repoRoot()}/skills/upstream.lock`,
    });
  } catch {
    console.log("     · upstream skills lock not available: skip vendor skill mirror removal");
  }
}

async function cleanupPiMcpAdapterIfUnused(home: string): Promise<void> {
  const agentDir = `${home}/.pi/agent`;
  if (!(await exists(agentDir))) return;

  const mcpFile = `${agentDir}/mcp.json`;
  const mcp = await (async () => {
    if (!(await exists(mcpFile))) return {};
    try {
      const parsed = JSON.parse(await readFile(mcpFile, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  })();
  if (!mcp) {
    console.log("     · Pi MCP config not JSON; keep pi-mcp-adapter");
    return;
  }

  const servers = mcp["mcpServers"];
  const serverCount = servers && typeof servers === "object" && !Array.isArray(servers)
    ? Object.keys(servers as Record<string, unknown>).length
    : 0;
  if (serverCount > 0) {
    console.log("     · keep Pi pi-mcp-adapter (MCP servers remain)");
    return;
  }

  if ("mcpServers" in mcp) {
    delete mcp["mcpServers"];
    await wf(mcpFile, JSON.stringify(mcp, null, 2) + "\n");
    console.log(`     - empty Pi mcpServers removed → ${mcpFile}`);
  }

  const settingsFile = `${agentDir}/settings.json`;
  const settings = await (async () => {
    if (!(await exists(settingsFile))) return {};
    try {
      const parsed = JSON.parse(await readFile(settingsFile, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  })();
  if (!settings) {
    console.log("     · Pi settings not JSON; keep pi-mcp-adapter");
    return;
  }
  const packages = settings["packages"];
  if (!Array.isArray(packages) || !packages.includes("npm:pi-mcp-adapter")) {
    console.log("     · Pi pi-mcp-adapter package entry not present");
    return;
  }
  settings["packages"] = packages.filter((value) => value !== "npm:pi-mcp-adapter");
  await wf(settingsFile, JSON.stringify(settings, null, 2) + "\n");
  console.log(`     - Pi pi-mcp-adapter package entry removed → ${settingsFile}`);
}

async function codexCavemanPackageHookSources(home: string): Promise<Record<string, unknown[]> | null> {
  const root = `${home}/.codex/plugins/cache/caveman/caveman`;
  if (!(await exists(root))) return null;
  const collected: Record<string, unknown[]> = {};
  for (const version of await readdir(root, { withFileTypes: true })) {
    if (!version.isDirectory()) continue;
    const hooksPath = `${root}/${version.name}/package/.codex/hooks.json`;
    const parsed = await readJsonObject(hooksPath);
    const hooks = parsed?.["hooks"];
    if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) continue;
    for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      collected[event] = [...(collected[event] ?? []), ...entries];
    }
  }
  return Object.keys(collected).length > 0 ? collected : null;
}

function isCavemanHookEntry(entry: unknown): boolean {
  return JSON.stringify(entry).toLowerCase().includes("caveman");
}

async function removeCodexCavemanHooks(home: string): Promise<void> {
  const target = `${home}/.codex/hooks.json`;
  const targetJson = await readJsonObject(target);
  if (!targetJson) return;
  const targetHooks = targetJson["hooks"];
  if (!targetHooks || typeof targetHooks !== "object" || Array.isArray(targetHooks)) return;

  const sourceHooks = await codexCavemanPackageHookSources(home);
  let changed = false;
  for (const [event, entries] of Object.entries(targetHooks as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    const sourceKeys = new Set((sourceHooks?.[event] ?? []).map((entry) => JSON.stringify(entry)));
    const next = entries.filter((entry) => {
      if (sourceKeys.size > 0) return !sourceKeys.has(JSON.stringify(entry));
      return !isCavemanHookEntry(entry);
    });
    if (next.length !== entries.length) changed = true;
    if (next.length === 0) delete (targetHooks as Record<string, unknown>)[event];
    else (targetHooks as Record<string, unknown>)[event] = next;
  }
  if (!changed) return;
  if (Object.keys(targetHooks as Record<string, unknown>).length === 0) delete targetJson["hooks"];
  await writeOrRemoveJson(target, targetJson, "Codex Caveman hooks config");
}

async function removeCodexCavemanConfig(home: string): Promise<void> {
  const configPath = `${home}/.codex/config.toml`;
  if (!(await exists(configPath))) return;
  if (DRY_RUN) {
    console.log(`     [dry-run] would remove Codex Caveman plugin config from: ${configPath}`);
    return;
  }
  const existing = await readFile(configPath, "utf8");
  let next = removeTomlSection(existing, "[plugins.\"caveman@caveman\"]");
  next = removeTomlSection(next, "[marketplaces.caveman]");
  await wf(configPath, next ? `${next}\n` : "");
  console.log(`     - Codex Caveman plugin config cleaned → ${configPath}`);
}

async function removeCavemanMirrorSurfaces(home: string): Promise<void> {
  if (!DRY_RUN && !(await hasCavemanMirrorMarker(home))) {
    console.log("     · skip Caveman fallback mirrors removal (Fulcrum marker not present)");
    return;
  }

  await removeCodexCavemanHooks(home);
  await removeCodexCavemanConfig(home);

  const mirrorAgents: Array<{ dir: string; label: string; agent: typeof AGENTS[number]; packageDir: string }> = [
    { dir: `${home}/.codex`, label: "Codex CLI", agent: AGENTS.find((a) => a.id === "codex")!, packageDir: `${home}/.codex/plugins/cache/caveman` },
    { dir: `${home}/.config/opencode`, label: "OpenCode", agent: AGENTS.find((a) => a.id === "opencode")!, packageDir: `${home}/.config/opencode/packages/caveman` },
    { dir: `${home}/.pi/agent`, label: "Pi CLI", agent: AGENTS.find((a) => a.id === "pi")!, packageDir: `${home}/.pi/agent/packages/caveman` },
  ];
  for (const { dir, label, agent, packageDir } of mirrorAgents) {
    if (!(await exists(dir))) continue;
    await removePath(agent.cavemanInstallDir(home), `${label} caveman install dir`);
    await removePath(packageDir, `${label} caveman package mirror`);
  }
  await removeCavemanSkillSiblings(home);
  await removePath(cavemanMirrorMarkerPath(home), "Caveman fallback mirrors marker");
}

export async function removeCavemanCopies(home: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  const previousDryRun = DRY_RUN;
  DRY_RUN = opts.dryRun ?? DRY_RUN;
  try {
    // W1.1: Claude Code: only invoke `claude plugin uninstall caveman@caveman`
    // when Fulcrum has the per-plugin ownership marker. Without the marker,
    // the user installed caveman themselves and Fulcrum must not touch it.
    const claudeDir = `${home}/.claude`;
    if (await exists(claudeDir)) {
      if (!(await which("claude"))) {
        console.log("     · Claude Code caveman: `claude` not on PATH: manual: claude plugin uninstall caveman@caveman");
      } else {
        const { safeClaudePluginUninstall, hasMarker } = await import("./claude-plugin-markers.ts");
        const r = await safeClaudePluginUninstall("caveman@caveman", { dryRun: DRY_RUN });
        if (!r.ran) {
          console.log(`     · Claude Code caveman plugin: ${r.reason ?? "skipped"}: manual: claude plugin uninstall caveman@caveman`);
        } else if (!r.ok) {
          console.log(`     · Claude Code caveman plugin uninstall failed (exit ${r.exit}): ${r.stderr?.trim() ?? ""}`);
        } else {
          console.log("     ✓ Claude Code caveman plugin uninstalled");
        }
        // Cache/marketplace dirs are owned by Fulcrum only when the marker authorised the install.
        // Removing them blindly can drop user-installed plugin state: gate on the marker.
        if (await hasMarker("caveman@caveman") || r.ran) {
          await removePath(`${home}/.claude/plugins/cache/caveman`, "Claude Code caveman plugin cache");
          await removePath(`${home}/.claude/plugins/marketplaces/caveman`, "Claude Code caveman marketplace cache");
        } else {
          console.log("     · keep Claude Code caveman cache/marketplace dirs (no Fulcrum ownership marker)");
        }
      }
    }

    // W1.2: Gemini CLI: call `gemini extensions uninstall caveman` when Gemini
    // is detected and `gemini` is on PATH. Best-effort: log + continue.
    const geminiDir = `${home}/.gemini`;
    if (await exists(geminiDir)) {
      if (await which("gemini")) {
        await runBestEffort(
          ["gemini", "extensions", "uninstall", "caveman"],
          "Gemini CLI caveman extension uninstall",
        );
      } else {
        console.log("     · Gemini CLI caveman: `gemini` not on PATH: manual: gemini extensions uninstall caveman");
      }
    }
    await removePath(`${home}/.gemini/extensions/caveman`, "Gemini CLI caveman extension");

    await removeCavemanMirrorSurfaces(home);

    const cfgPath = process.env["XDG_CONFIG_HOME"]
      ? `${process.env["XDG_CONFIG_HOME"]}/caveman/config.json`
      : `${home}/.config/caveman/config.json`;
    await removePath(cfgPath, "caveman config");
  } finally {
    DRY_RUN = previousDryRun;
  }
}

const CAVEMAN_SKILL_NAMES = [
  "caveman", "caveman-commit", "caveman-compress", "compress", "caveman-help", "caveman-review",
] as const;

async function removeCavemanSkillSiblings(home: string): Promise<void> {
  const roots = [
    `${home}/.claude/skills`,
    `${home}/.codex/skills`,
    `${home}/.gemini/skills`,
    `${home}/.config/opencode/skills`,
    `${home}/.pi/agent/skills`,
  ];
  for (const root of roots) {
    if (!(await exists(root))) continue;
    for (const name of CAVEMAN_SKILL_NAMES) {
      await removePath(`${root}/${name}`, `caveman skill ${name}`);
    }
  }
}

async function cleanupEmptyAgentConfigContainers(home: string): Promise<void> {
  const codexHooksFile = `${home}/.codex/hooks.json`;
  const codexHooks = await readJsonObject(codexHooksFile);
  if (codexHooks && isEmptyObject(codexHooks["hooks"])) {
    delete codexHooks["hooks"];
    await writeOrRemoveJson(codexHooksFile, codexHooks, "Codex empty hooks config");
  } else if (codexHooks && codexHooks["hooks"] && typeof codexHooks["hooks"] === "object" && !Array.isArray(codexHooks["hooks"])) {
    const hooks = codexHooks["hooks"] as Record<string, unknown>;
    for (const [name, value] of Object.entries(hooks)) {
      if (isEmptyArray(value)) delete hooks[name];
    }
    if (Object.keys(hooks).length === 0) delete codexHooks["hooks"];
    await writeOrRemoveJson(codexHooksFile, codexHooks, "Codex empty hooks config");
  }

  const geminiSettingsFile = `${home}/.gemini/settings.json`;
  const gemini = await readJsonObject(geminiSettingsFile);
  if (gemini) {
    if (isEmptyObject(gemini["mcpServers"])) delete gemini["mcpServers"];
    if (gemini["hooks"] && typeof gemini["hooks"] === "object" && !Array.isArray(gemini["hooks"])) {
      const hooks = gemini["hooks"] as Record<string, unknown>;
      for (const [name, value] of Object.entries(hooks)) {
        if (isEmptyArray(value)) delete hooks[name];
      }
      if (Object.keys(hooks).length === 0) delete gemini["hooks"];
    }
    await writeOrRemoveJson(geminiSettingsFile, gemini, "Gemini empty Fulcrum containers");
  }

  const openCodeFile = `${home}/.config/opencode/opencode.json`;
  const openCode = await readJsonObject(openCodeFile);
  if (openCode) {
    if (isEmptyObject(openCode["mcp"])) delete openCode["mcp"];
    if (isEmptyArray(openCode["plugin"])) delete openCode["plugin"];
    await writeOrRemoveJson(openCodeFile, openCode, "OpenCode empty Fulcrum containers");
  }

  const piSettingsFile = `${home}/.pi/agent/settings.json`;
  const piSettings = await readJsonObject(piSettingsFile);
  if (piSettings) {
    if (isEmptyArray(piSettings["packages"])) delete piSettings["packages"];
    await writeOrRemoveJson(piSettingsFile, piSettings, "Pi empty package container");
  }

  const piMcpFile = `${home}/.pi/agent/mcp.json`;
  const piMcp = await readJsonObject(piMcpFile);
  if (piMcp) {
    if (isEmptyObject(piMcp["mcpServers"])) delete piMcp["mcpServers"];
    await writeOrRemoveJson(piMcpFile, piMcp, "Pi empty MCP config");
  }
}

async function cleanupClaudeManagedPluginSettings(home: string): Promise<void> {
  const file = `${home}/.claude/settings.json`;
  const root = await readJsonObject(file);
  if (!root) return;
  const { hasMarker } = await import("./claude-plugin-markers.ts");

  let changed = false;
  const marketplaces = root["extraKnownMarketplaces"];
  if (marketplaces && typeof marketplaces === "object" && !Array.isArray(marketplaces)) {
    const ownedMarketplaces = [
      ["fulcrum", "fulcrum@fulcrum"],
      ["caveman", "caveman@caveman"],
      ["cloudflare", "cloudflare@cloudflare"],
    ] as const;
    for (const [key, plugin] of ownedMarketplaces) {
      if (key in marketplaces) {
        if (!(await hasMarker(plugin))) {
          console.log(`     · keep Claude Code marketplace ${key} (not-owned-by-fulcrum)`);
          continue;
        }
        delete (marketplaces as Record<string, unknown>)[key];
        changed = true;
      }
    }
    if (Object.keys(marketplaces as Record<string, unknown>).length === 0) {
      delete root["extraKnownMarketplaces"];
    }
  }

  const enabledPlugins = root["enabledPlugins"];
  if (enabledPlugins && typeof enabledPlugins === "object" && !Array.isArray(enabledPlugins)) {
    for (const key of [
      "fulcrum@fulcrum",
      "caveman@caveman",
      "cloudflare@cloudflare",
      "superpowers@claude-plugins-official",
    ]) {
      if (key in enabledPlugins) {
        if (!(await hasMarker(key))) {
          console.log(`     · keep Claude Code plugin setting ${key} (not-owned-by-fulcrum)`);
          continue;
        }
        delete (enabledPlugins as Record<string, unknown>)[key];
        changed = true;
      }
    }
    if (Object.keys(enabledPlugins as Record<string, unknown>).length === 0) {
      delete root["enabledPlugins"];
    }
  }

  if (!changed) {
    console.log("     · Claude Code managed plugin settings not present");
    return;
  }
  await wf(file, JSON.stringify(root, null, 2) + "\n");
  console.log(`     - Claude Code managed plugin settings cleaned → ${file}`);
}

async function removeClaudePluginCacheLeftovers(home: string): Promise<void> {
  const { hasMarker } = await import("./claude-plugin-markers.ts");
  const paths: Array<[string, string, readonly string[]]> = [
    [`${home}/.claude/plugins/cache/fulcrum`, "Claude Code fulcrum plugin cache", ["fulcrum@fulcrum"]],
    [`${home}/.claude/plugins/marketplaces/fulcrum`, "Claude Code fulcrum marketplace cache", ["fulcrum@fulcrum"]],
    [`${home}/.claude/plugins/cache/caveman`, "Claude Code caveman plugin cache", ["caveman@caveman"]],
    [`${home}/.claude/plugins/marketplaces/caveman`, "Claude Code caveman marketplace cache", ["caveman@caveman"]],
    [`${home}/.claude/plugins/cache/cloudflare`, "Cloudflare Claude plugin cache", ["cloudflare@cloudflare"]],
    [`${home}/.claude/plugins/marketplaces/cloudflare`, "Cloudflare Claude marketplace cache", ["cloudflare@cloudflare"]],
    [`${home}/.claude/plugins/cache/claude-plugins-official/superpowers`, "Superpowers Claude plugin cache", ["superpowers@claude-plugins-official"]],
  ];
  for (const [path, label, plugins] of paths) {
    const owned = (await Promise.all(plugins.map((plugin) => hasMarker(plugin)))).some(Boolean);
    if (!owned) {
      console.log(`     · keep ${label} (not-owned-by-fulcrum)`);
      continue;
    }
    await removePath(path, label);
  }
  await cleanupClaudeManagedPluginSettings(home);
}

async function removePackageMirrorLeftovers(home: string): Promise<void> {
  const paths: Array<[string, string]> = [
    [`${home}/.codex/plugins/cache/caveman`, "Codex CLI caveman package cache root"],
    [`${home}/.codex/plugins/cache/cloudflare`, "Codex CLI cloudflare package cache root"],
    [`${home}/.codex/plugins/cache/superpowers`, "Codex CLI superpowers package cache root"],
    [`${home}/.gemini/extensions/caveman`, "Gemini CLI caveman extension"],
    [`${home}/.gemini/extensions/cloudflare`, "Gemini CLI cloudflare extension"],
    [`${home}/.gemini/extensions/superpowers`, "Gemini CLI superpowers extension"],
    [`${home}/.config/opencode/packages/caveman`, "OpenCode caveman package mirror"],
    [`${home}/.config/opencode/packages/cloudflare`, "OpenCode cloudflare package mirror"],
    [`${home}/.config/opencode/packages/superpowers`, "OpenCode superpowers package mirror"],
    [`${home}/.pi/agent/packages/caveman`, "Pi CLI caveman package mirror"],
    [`${home}/.pi/agent/packages/cloudflare`, "Pi CLI cloudflare package mirror"],
    [`${home}/.pi/agent/packages/superpowers`, "Pi CLI superpowers package mirror"],
  ];
  for (const [path, label] of paths) {
    await removePath(path, label);
  }
}

async function removeCodexManagedMcpLeftovers(home: string): Promise<void> {
  const file = `${home}/.codex/config.toml`;
  if (!(await exists(file))) return;
  const { BUILTIN_MCPS } = await import("./mcp-builtins.ts");
  const existing = await readFile(file, "utf8");
  let next = existing;
  for (const { name } of BUILTIN_MCPS) {
    const begin = `# BEGIN FULCRUM MCP ${name}`;
    const end = `# END FULCRUM MCP ${name}`;
    next = next.replace(
      new RegExp(`\\n?${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m"),
      "\n",
    );
    next = next.replace(
      new RegExp(`\\n?\\[mcp_servers\\.${escapeRegExp(name)}\\][\\s\\S]*?${escapeRegExp(end)}\\n?`, "m"),
      "\n",
    );
  }
  next = next.replace(/\n{3,}/g, "\n\n").trimEnd();
  if (next === existing.trimEnd()) {
    console.log("     · Codex managed MCP leftovers not present");
    return;
  }
  await wf(file, next ? `${next}\n` : "");
  console.log(`     - Codex managed MCP leftovers cleaned → ${file}`);
}

async function removePurgeState(keepState: boolean): Promise<void> {
  await removePath(`${fulcrumHome()}/cache`, "Fulcrum package/cache directory");
  if (keepState) {
    console.log("     · keep generated state (--keep-state)");
    return;
  }
  await removePath(`${fulcrumHome()}/state/global/components.db`, "component ledger database");
  await removePath(`${fulcrumHome()}/state/global/upstream-skills`, "upstream skill install markers");
  await removePath(`${fulcrumHome()}/state/global/backups`, "Fulcrum conflict backups");
  await removePath(`${fulcrumHome()}/state/global/smoke-test`, "smoke-test records");
  await removePath(`${fulcrumHome()}/state/product`, "product kernel database and artifacts");
  await removeEmptyDir(`${fulcrumHome()}/hooks`, "empty Fulcrum hooks directory");
  await removeEmptyDir(`${fulcrumHome()}/state/global`, "empty Fulcrum global state directory");
  await removeEmptyDir(`${fulcrumHome()}/state`, "empty Fulcrum state directory");
}

/**
 * For every entry in the MCP registry, call removeFromAgents (regardless of
 * enabled state). Then delete the registry file unless --keep-state is passed.
 */
async function uninstallMcpRegistryEntries(home: string, keepState: boolean, dryRun: boolean): Promise<void> {
  try {
    const { loadRegistry, removeFromAgents } = await import("./mcp-registry.ts");
    const reg = await loadRegistry();
    for (const server of Object.values(reg.servers)) {
      console.log(`     removing ${server.name} MCP from all agents`);
      if (!dryRun) {
        await removeFromAgents(server.name, { dryRun });
      } else {
        console.log(`     [dry-run] would remove ${server.name} from all agents`);
      }
    }
  } catch {
    // Registry may not exist if install was never run
    console.log("     · MCP registry not present (skip)");
  }

  // Delete registry file unless keepState.
  if (!keepState) {
    const fHome = process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
    const registryFile = `${fHome}/state/global/mcp-registry.toml`;
    await removePath(registryFile, "MCP registry file");
  } else {
    console.log("     · keep MCP registry file (--keep-state)");
  }
}

export async function run(args: string[]): Promise<void> {
  let purge = false;
  let includeCaveman = false;
  let keepState = false;
  DRY_RUN = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      DRY_RUN = true;
    } else if (arg === "--purge") {
      purge = true;
    } else if (arg === "--include-caveman") {
      includeCaveman = true;
    } else if (arg === "--keep-state") {
      keepState = true;
    } else if (arg === "--allow-claude-cli") {
      const { setClaudeCliAllowed } = await import("./claude-plugin-markers.ts");
      setClaudeCliAllowed(true);
    } else {
      console.error(`fulcrum uninstall: unknown arg '${arg}'`);
      process.exit(2);
    }
  }

  if (DRY_RUN) {
    console.log("(dry-run mode: no files will be removed or written)\n");
  }

  const home = process.env["HOME"] ?? "";
  console.log("Fulcrum uninstall\n");

  const exclude = includeCaveman ? [] : ["package.caveman"];
  if (keepState) {
    exclude.push("mcp.registry");
  }

  console.log("1/4  Removing component profile profile.default");
  const { planComponentOperation } = await import("@platform-core/application/component-lifecycle/planner.ts");
  const { executeComponentPlan } = await import("@platform-core/application/component-lifecycle/executor.ts");
  const plan = planComponentOperation({
    operation: "remove",
    target: "profile.default",
    exclude,
  });
  await executeComponentPlan(plan, {
    dryRun: DRY_RUN,
    purge,
    keepState,
    includeCaveman,
  });
  console.log();

  console.log("2/4  Removing compatibility leftovers");
  await removeExactLine(`${home}/.gemini/GEMINI.md`, "@AGENTS.md", "Gemini @AGENTS.md import");
  const { removeAllHookRegistrations } = await import("./hooks.ts");
  await removeAllHookRegistrations({ dryRun: DRY_RUN });
  await removePath(`${fulcrumHome()}/hooks/snippets`, "hook snippets");
  await removePath(`${fulcrumHome()}/hooks/enabled`, "hook enable markers");
  await removeSkillNamespaces(home);
  if (purge) {
    await removeClaudePluginCacheLeftovers(home);
    await removePackageMirrorLeftovers(home);
    await removeCodexManagedMcpLeftovers(home);
  }
  console.log();

  console.log("3/4  Cleaning registry and empty agent containers");
  if (!keepState) {
    await removePath(`${fulcrumHome()}/state/global/mcp-registry.toml`, "MCP registry file");
  } else {
    console.log("     · keep MCP registry file (--keep-state)");
  }
  await cleanupPiMcpAdapterIfUnused(home);
  await cleanupEmptyAgentConfigContainers(home);
  if (purge) await removePurgeState(keepState);
  console.log();

  console.log("4/4  Optional third-party installs");
  if (!includeCaveman) {
    console.log("     · keep caveman (use --include-caveman to remove Fulcrum-installed copies/config)");
  }

  console.log("\nDone.");
}
