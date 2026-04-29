// fulcrum uninstall — remove Fulcrum-managed install artifacts.
//
// Conservative by default: remove sentinel-spliced rules, managed skill
// namespaces, hook snippets/markers, generated Gemini import lines, and
// Fulcrum-managed context-mode registrations. Leave user-edited policy files
// and third-party caveman installs alone unless an explicit flag says otherwise.

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { AGENTS } from "../agents/registry.ts";
import { which, run as runProc } from "../utils/proc.ts";

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
    console.log(`     · ${label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()} — continuing`);
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
    // Authored fulcrum plugin (current install path for Claude Code).
    await runBestEffort(
      ["claude", "plugin", "uninstall", "fulcrum@fulcrum"],
      "Claude Code fulcrum plugin uninstall",
    );

    // W1.6: Before removing the fulcrum-upstream namespace for Claude Code,
    // uninstall any upstream skills that were installed via `claude plugin`.
    try {
      const { loadUpstreamSkills } = await import("./upstream-skills.ts");
      const repoRoot = process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
      const lockPath = `${repoRoot}/skills/upstream.lock`;
      const skills = await loadUpstreamSkills(lockPath);
      for (const skill of skills) {
        if (skill.claude_plugin) {
          await runBestEffort(
            ["claude", "plugin", "uninstall", skill.claude_plugin.name],
            `Claude Code ${skill.name} plugin uninstall`,
          );
        }
      }
    } catch {
      // lockfile may not be present in all contexts — best-effort
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
  await removeManagedUpstreamSkills(home);
}

const FALLBACK_UPSTREAM_SKILL_NAMES = [
  "superpowers-brainstorming", "brainstorming",
  "superpowers-writing-plans", "writing-plans",
  "superpowers-systematic-debugging", "systematic-debugging",
  "superpowers-requesting-code-review", "requesting-code-review",
  "superpowers-using-git-worktrees", "using-git-worktrees",
  "superpowers-using-superpowers", "using-superpowers",
  "playwright-cli",
  "semgrep",
  "semgrep-code-security", "code-security",
  "semgrep-llm-security", "llm-security",
  "graphify",
  "cloudflare-agents-sdk", "agents-sdk",
  "cloudflare-platform", "cloudflare",
  "cloudflare-email-service",
  "cloudflare-durable-objects", "durable-objects",
  "cloudflare-sandbox-sdk", "sandbox-sdk",
  "cloudflare-web-perf", "web-perf",
  "cloudflare-workers-best-practices", "workers-best-practices",
  "wrangler",
  // Historical vendor installs from archived lock entries/init integrations.
  "ast-grep", "tavily-search", "tavily-extract", "tavily-crawl", "tavily-map", "tavily-research",
] as const;

function addUpstreamSkillNamesFromLock(names: Set<string>, skill: { name: string; subpath: string; kind: "dir" | "file" }): void {
  names.add(skill.name);
  if (skill.kind === "dir") {
    names.add(basename(skill.subpath));
    return;
  }
  const base = basename(skill.subpath).toLowerCase();
  if (base !== "skill.md" && base !== "skill") names.add(basename(skill.subpath, ".md"));
}

async function managedUpstreamSkillNames(): Promise<Set<string>> {
  const names = new Set<string>(FALLBACK_UPSTREAM_SKILL_NAMES);
  try {
    const { loadUpstreamSkills } = await import("./upstream-skills.ts");
    const lockPath = `${repoRoot()}/skills/upstream.lock`;
    for (const skill of await loadUpstreamSkills(lockPath)) {
      addUpstreamSkillNamesFromLock(names, skill);
    }
  } catch {
    // lockfile may not be present in all contexts; fallback list still covers shipped managed skills.
  }
  return names;
}

async function removeManagedUpstreamSkills(home: string): Promise<void> {
  const names = await managedUpstreamSkillNames();
  const targets: Array<{ label: string; root: string }> = [];
  for (const agent of AGENTS) {
    targets.push({
      label: agent.label,
      root: agent.id === "gemini" ? `${home}/.gemini/skills` : agent.skillsDir(home),
    });
  }

  for (const target of targets) {
    if (!(await exists(target.root))) continue;
    for (const name of names) {
      await removePath(`${target.root}/${name}`, `${target.label} upstream skill ${name}`);
    }
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

async function removeCavemanCopies(home: string): Promise<void> {
  // W1.1: Claude Code — call `claude plugin uninstall caveman@caveman` when
  // Claude is detected and `claude` is on PATH. Best-effort: log + continue.
  const claudeDir = `${home}/.claude`;
  if (await exists(claudeDir)) {
    if (await which("claude")) {
      await runBestEffort(
        ["claude", "plugin", "uninstall", "caveman@caveman"],
        "Claude Code caveman plugin uninstall",
      );
    } else {
      console.log("     · Claude Code caveman: `claude` not on PATH — manual: claude plugin uninstall caveman@caveman");
    }
  }

  // W1.2: Gemini CLI — call `gemini extensions uninstall caveman` when Gemini
  // is detected and `gemini` is on PATH. Best-effort: log + continue.
  const geminiDir = `${home}/.gemini`;
  if (await exists(geminiDir)) {
    if (await which("gemini")) {
      await runBestEffort(
        ["gemini", "extensions", "uninstall", "caveman"],
        "Gemini CLI caveman extension uninstall",
      );
    } else {
      console.log("     · Gemini CLI caveman: `gemini` not on PATH — manual: gemini extensions uninstall caveman");
    }
  }

  // W1.4: Codex/OpenCode/Pi — call `npx skills remove caveman` for each
  // detected agent. Fallback to removePath when npx is not available.
  const npxPath = await which("npx");
  const npxAgents: Array<{ dir: string; label: string; agent: typeof AGENTS[number] }> = [
    { dir: `${home}/.codex`, label: "Codex CLI", agent: AGENTS.find((a) => a.id === "codex")! },
    { dir: `${home}/.config/opencode`, label: "OpenCode", agent: AGENTS.find((a) => a.id === "opencode")! },
    { dir: `${home}/.pi/agent`, label: "Pi CLI", agent: AGENTS.find((a) => a.id === "pi")! },
  ];
  for (const { dir, label, agent } of npxAgents) {
    if (!(await exists(dir))) continue;
    if (npxPath) {
      // npx skills remove does not need an -a flag — it auto-detects from cwd/env.
      // Pass --yes to suppress interactive prompts (Bash 3.2-safe: no arrays).
      await runBestEffort(
        ["npx", "skills", "remove", "caveman", "--yes"],
        `${label} caveman skills remove via npx`,
      );
    } else {
      // Fallback: file-system removal of the install dir.
      await removePath(agent.cavemanInstallDir(home), `${label} caveman install (fs fallback)`);
    }
  }

  // Always remove file-copy installs as cleanup for agents where caveman was
  // installed with `npx skills add`; plugin/extension agents are handled by
  // their native uninstall commands above.
  for (const agent of AGENTS) {
    if (agent.id === "claude-code" || agent.id === "gemini") continue;
    await removePath(agent.cavemanInstallDir(home), `${agent.label} caveman install dir`);
  }
  await removeCavemanSkillSiblings(home);

  const cfgPath = process.env["XDG_CONFIG_HOME"]
    ? `${process.env["XDG_CONFIG_HOME"]}/caveman/config.json`
    : `${home}/.config/caveman/config.json`;
  await removePath(cfgPath, "caveman config");
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

const REPOMIX_PLUGINS = ["repomix-mcp", "repomix-commands", "repomix-explorer"] as const;
const REPOMIX_MARKER_FILE = "repomix-claude.installed";

async function uninstallRepomixClaudePlugins(home: string): Promise<void> {
  if (!(await exists(`${home}/.claude`))) return;
  if (!(await which("claude"))) {
    console.log("     · claude not on PATH — repomix plugins: manual: claude plugin uninstall repomix-mcp@repomix ...");
    return;
  }
  for (const plugin of REPOMIX_PLUGINS) {
    await runBestEffort(
      ["claude", "plugin", "uninstall", `${plugin}@repomix`],
      `Claude Code ${plugin}@repomix plugin uninstall`,
    );
  }
  // Remove marker file.
  const fHome = process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
  const markerFile = `${fHome}/state/global/${REPOMIX_MARKER_FILE}`;
  await removePath(markerFile, "repomix Claude plugins marker");
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

  // Uninstall repomix Claude plugins.
  await uninstallRepomixClaudePlugins(home);

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
    } else {
      console.error(`fulcrum uninstall: unknown arg '${arg}'`);
      process.exit(2);
    }
  }

  if (DRY_RUN) {
    console.log("(dry-run mode — no files will be removed or written)\n");
  }

  const home = process.env["HOME"] ?? "";
  console.log("Fulcrum uninstall\n");

  console.log("1/7  Removing Fulcrum rules blocks");
  for (const agent of AGENTS) {
    await removeSentinelBlock(agent.rulesFile(home), agent.label);
  }
  console.log();

  console.log("2/7  Removing generated Gemini import");
  await removeExactLine(`${home}/.gemini/GEMINI.md`, "@AGENTS.md", "Gemini @AGENTS.md import");
  console.log();

  console.log("3/7  Removing hook snippets and markers");
  const { removeAllHookRegistrations } = await import("./hooks.ts");
  await removeAllHookRegistrations();
  await removePath(`${fulcrumHome()}/hooks/snippets`, "hook snippets");
  await removePath(`${fulcrumHome()}/hooks/enabled`, "hook enable markers");
  console.log();

  console.log("4/7  Removing managed skill namespaces");
  await removeSkillNamespaces(home);
  console.log();

  console.log("5/7  Removing DeepWiki MCP registrations");
  const { uninstallDeepwikiMcp } = await import("./mcp.ts");
  await uninstallDeepwikiMcp({ dryRun: DRY_RUN });
  console.log();

  console.log("5b/7 Removing MCP registry entries from agents");
  await uninstallMcpRegistryEntries(home, keepState, DRY_RUN);
  console.log();

  console.log("6/7  Removing context-mode registrations");
  const { uninstallContextMode } = await import("./context-mode.ts");
  await uninstallContextMode({ dryRun: DRY_RUN });
  await cleanupPiMcpAdapterIfUnused(home);
  console.log();

  console.log("7/7  Removing policy and optional third-party installs");
  await removePolicy(purge);
  if (includeCaveman) {
    await removeCavemanCopies(home);
  } else {
    console.log("     · keep caveman (use --include-caveman to remove Fulcrum-installed copies/config)");
  }
  await cleanupEmptyAgentConfigContainers(home);

  console.log("\nDone.");
}
