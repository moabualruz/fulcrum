import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cloneOrUpdate, run as runProc, which } from "../utils/proc.ts";
import { DEFAULT_REPOMIX_SERVER } from "./mcp-builtins.ts";
import type { AgentId } from "./mcp-registry.ts";

const PACK_LOCAL = "repomix-pack-local";
const PACK_REMOTE = "repomix-pack-remote";
const EXPLORER = "repomix-explorer";
const EXPLORE_LOCAL = "repomix-explore-local";
const EXPLORE_REMOTE = "repomix-explore-remote";
const REPOMIX_REPO = "https://github.com/yamadashy/repomix";
const REPOMIX_MARKETPLACE = "yamadashy/repomix";
const REPOMIX_MARKER_FILE = "repomix-claude.installed";
const REPOMIX_MIRRORS_MARKER_FILE = "repomix-mirrors.installed";
const REPOMIX_CLAUDE_PLUGINS = ["repomix-mcp", "repomix-commands", "repomix-explorer"] as const;
const REPOMIX_CODEX_PLUGIN_VERSION = "1.0.0";
const REPOMIX_REGISTRY_AGENTS: AgentId[] = ["codex", "opencode", "pi"];
const REPOMIX_RULES_BEGIN = "<!-- BEGIN FULCRUM REPOMIX RULES -->";
const REPOMIX_RULES_END = "<!-- END FULCRUM REPOMIX RULES -->";

const PACK_LOCAL_DESCRIPTION = "Pack local codebases with Repomix";
const PACK_REMOTE_DESCRIPTION = "Pack remote repositories with Repomix";
const EXPLORER_DESCRIPTION = "Explore local or remote repositories using Repomix output";
const EXPLORE_LOCAL_DESCRIPTION = "Explore a local repository with Repomix";
const EXPLORE_REMOTE_DESCRIPTION = "Explore a remote repository with Repomix";

interface RepomixPackageSource {
  packLocal: string;
  packRemote: string;
  explorer: string;
  exploreLocal: string;
  exploreRemote: string;
  mcpJson: string;
  rules: string;
}

interface RepomixPackageOptions {
  dryRun?: boolean;
  agents?: readonly AgentId[];
}

function selectedAgent(agents: readonly AgentId[] | undefined, agentId: AgentId): boolean {
  return agents === undefined || agents.includes(agentId);
}

function selectedRegistryAgents(agents: readonly AgentId[] | undefined): AgentId[] {
  return REPOMIX_REGISTRY_AGENTS.filter((agentId) => selectedAgent(agents, agentId));
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function writeText(path: string, body: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`     [dry-run] would write: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  if (!(await exists(path))) return {};
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function writeJsonFile(path: string, data: Record<string, unknown>, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`     [dry-run] would write: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

async function setGeminiMcpEnabled(
  home: string,
  name: string,
  enabled: boolean,
  dryRun: boolean,
): Promise<void> {
  const file = `${home}/.gemini/mcp-server-enablement.json`;
  if (enabled && !(await exists(file))) return;
  const enablement = await readJsonObject(file);
  if (enabled) {
    delete enablement[name];
  } else {
    enablement[name] = { enabled: false };
  }
  if (enabled && Object.keys(enablement).length === 0) {
    if (dryRun) console.log(`     [dry-run] would write: ${file}`);
    else await writeJsonFile(file, enablement, false);
    return;
  }
  await writeJsonFile(file, enablement, dryRun);
}

async function removePath(path: string, label: string, dryRun: boolean): Promise<void> {
  if (!(await exists(path))) {
    console.log(`     · ${label} not present`);
    return;
  }
  if (dryRun) {
    console.log(`     [dry-run] would remove: ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
  console.log(`     - ${label} → ${path}`);
}

function markerFile(home: string, marker: string): string {
  return `${fulcrumStateDir(home)}/${marker}`;
}

async function markerPresent(home: string, marker: string): Promise<boolean> {
  return exists(markerFile(home, marker));
}

async function writeMarker(home: string, marker: string, dryRun: boolean): Promise<void> {
  await writeText(markerFile(home, marker), new Date().toISOString() + "\n", dryRun);
}

function repoRoot(): string {
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

function fulcrumHome(home: string): string {
  return process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
}

function pluginCacheRoot(home: string): string {
  return `${home}/.claude/plugins/cache/repomix`;
}

function fulcrumStateDir(home: string): string {
  return `${fulcrumHome(home)}/state/global`;
}

async function runBestEffort(cmd: string[], label: string, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    console.log(`     [dry-run] would run: ${cmd.join(" ")}`);
    return true;
  }
  const result = await runProc(cmd, { timeoutMs: 60_000 });
  if (result.exit !== 0) {
    console.log(`     ✗ ${label} failed: ${result.stderr.trim() || result.stdout.trim()}`);
    return false;
  }
  console.log(`     ✓ ${label}`);
  return true;
}

export async function installRepomixClaudePlugins(opts: RepomixPackageOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  if (!selectedAgent(opts.agents, "claude-code")) return;
  if (!(await exists(`${home}/.claude`))) {
    console.log("     · skip repomix Claude plugins (Claude Code not detected)");
    return;
  }
  const markerFile = `${fulcrumStateDir(home)}/${REPOMIX_MARKER_FILE}`;
  if (dryRun) {
    await runBestEffort(["claude", "plugin", "marketplace", "add", REPOMIX_MARKETPLACE], "repomix marketplace add", true);
    for (const plugin of REPOMIX_CLAUDE_PLUGINS) {
      await runBestEffort(
        ["claude", "plugin", "install", `${plugin}@repomix`],
        `claude plugin install ${plugin}@repomix`,
        true,
      );
    }
    console.log(`     [dry-run] would write marker: ${markerFile}`);
    return;
  }
  if (!(await which("claude"))) {
    console.log("     · skip repomix Claude plugins (claude not on PATH)");
    return;
  }

  if (await exists(markerFile)) {
    console.log("     · repomix Claude plugins already installed (marker present)");
    return;
  }

  if (!(await runBestEffort(["claude", "plugin", "marketplace", "add", REPOMIX_MARKETPLACE], "repomix marketplace add", dryRun))) {
    console.log("     · skip repomix plugin installs");
    return;
  }

  let allOk = true;
  for (const plugin of REPOMIX_CLAUDE_PLUGINS) {
    const ok = await runBestEffort(
      ["claude", "plugin", "install", `${plugin}@repomix`],
      `claude plugin install ${plugin}@repomix`,
      dryRun,
    );
    allOk = allOk && ok;
  }

  if (!allOk) return;
  if (dryRun) {
    console.log(`     [dry-run] would write marker: ${markerFile}`);
    return;
  }
  await writeText(markerFile, new Date().toISOString() + "\n", false);
}

export async function uninstallRepomixClaudePlugins(opts: RepomixPackageOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  if (!selectedAgent(opts.agents, "claude-code")) return;
  if (!(await exists(`${home}/.claude`))) return;
  const markerFile = `${fulcrumStateDir(home)}/${REPOMIX_MARKER_FILE}`;
  if (!dryRun && !(await exists(markerFile))) {
    console.log("     · skip repomix Claude plugins uninstall (Fulcrum marker not present)");
    return;
  }
  if (dryRun) {
    for (const plugin of REPOMIX_CLAUDE_PLUGINS) {
      await runBestEffort(
        ["claude", "plugin", "uninstall", `${plugin}@repomix`],
        `Claude Code ${plugin}@repomix plugin uninstall`,
        true,
      );
    }
    await removePath(markerFile, "repomix Claude plugins marker", true);
    return;
  }
  if (!(await which("claude"))) {
    console.log("     · claude not on PATH — repomix plugins: manual: claude plugin uninstall repomix-mcp@repomix ...");
    return;
  }
  for (const plugin of REPOMIX_CLAUDE_PLUGINS) {
    await runBestEffort(
      ["claude", "plugin", "uninstall", `${plugin}@repomix`],
      `Claude Code ${plugin}@repomix plugin uninstall`,
      dryRun,
    );
  }
  await removePath(`${home}/.claude/plugins/cache/repomix`, "Repomix Claude plugin cache", dryRun);
  await removePath(`${home}/.claude/plugins/marketplaces/repomix`, "Repomix Claude marketplace cache", dryRun);
  await removePath(markerFile, "repomix Claude plugins marker", dryRun);
}

async function readFirstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await exists(path)) return readFile(path, "utf8");
  }
  return null;
}

function skill(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body.trim()}\n`;
}

function commandToml(description: string, prompt: string): string {
  const escaped = prompt.trim().replace(/"""/g, '\\"\\"\\"');
  return `description = ${JSON.stringify(description)}\nprompt = """\n${escaped}\n"""\n`;
}

function packageCommand(description: string, prompt: string): string {
  const body = prompt.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  return `---\ndescription: ${description}\n---\n\n${body}\n`;
}

function upsertTomlSection(existing: string, header: string, body: string): string {
  const section = `${header}\n${body.trimEnd()}\n`;
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)${escaped}\\n[\\s\\S]*?(?=\\n\\[|$)`);
  if (re.test(existing)) return existing.replace(re, `\n${section}`).trimStart();
  return `${existing.trimEnd()}\n\n${section}`.trimStart();
}

function removeTomlSection(existing: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)${escaped}\\n[\\s\\S]*?(?=\\n(?:\\[|# BEGIN FULCRUM MCP )|$)`);
  return existing.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
}

function upsertMarkedBlock(existing: string, body: string): string {
  const block = `${REPOMIX_RULES_BEGIN}\n${body.trim()}\n${REPOMIX_RULES_END}`;
  const re = new RegExp(`${REPOMIX_RULES_BEGIN}[\\s\\S]*?${REPOMIX_RULES_END}`);
  if (re.test(existing)) return existing.replace(re, block).trimEnd() + "\n";
  return `${existing.trimEnd()}\n\n${block}\n`.trimStart();
}

function removeMarkedBlock(existing: string): string {
  const re = new RegExp(`\\n?${REPOMIX_RULES_BEGIN}[\\s\\S]*?${REPOMIX_RULES_END}\\n?`);
  return existing.replace(re, "\n").replace(/\n{3,}/g, "\n\n").trimStart();
}

function opencodeAgentFromClaude(body: string): string {
  const withoutFrontmatter = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  return `---\ndescription: ${EXPLORER_DESCRIPTION}\nmode: subagent\npermission:\n  bash: ask\n  read: allow\n  grep: allow\n---\n\n${withoutFrontmatter}\n`;
}

function geminiAgentFromClaude(body: string): string {
  const withoutFrontmatter = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  return `---\nname: explorer\ndescription: ${JSON.stringify(EXPLORER_DESCRIPTION)}\nmodel: inherit\n---\n\n${withoutFrontmatter}\n`;
}

async function ensureRepomixRepoCache(home: string, dryRun: boolean): Promise<string | null> {
  const dir = `${fulcrumHome(home)}/cache/repomix`;
  if (await exists(`${dir}/.git`)) return dir;
  if (dryRun) {
    console.log(`     [dry-run] would clone/update ${REPOMIX_REPO} → ${dir}`);
    return dir;
  }
  const result = await cloneOrUpdate(REPOMIX_REPO, dir);
  if (result.exit !== 0) {
    console.log(`     · Repomix source clone/update failed: ${result.stderr.trim()}`);
    return null;
  }
  return dir;
}

async function repomixSource(home: string, dryRun: boolean): Promise<RepomixPackageSource | null> {
  const cache = pluginCacheRoot(home);
  const marketplace = `${home}/.claude/plugins/marketplaces/repomix/.claude`;
  const root = repoRoot();
  const readSource = async (repoCache: string | null): Promise<RepomixPackageSource | null> => {
    const packLocal = await readFirstExisting([
      `${cache}/repomix-commands/1.0.2/commands/pack-local.md`,
      `${marketplace}/plugins/repomix-commands/commands/pack-local.md`,
      ...(repoCache ? [`${repoCache}/.claude/plugins/repomix-commands/commands/pack-local.md`] : []),
      `${root}/.fulcrum-vendor/repomix/commands/pack-local.md`,
    ]);
    const packRemote = await readFirstExisting([
      `${cache}/repomix-commands/1.0.2/commands/pack-remote.md`,
      `${marketplace}/plugins/repomix-commands/commands/pack-remote.md`,
      ...(repoCache ? [`${repoCache}/.claude/plugins/repomix-commands/commands/pack-remote.md`] : []),
      `${root}/.fulcrum-vendor/repomix/commands/pack-remote.md`,
    ]);
    const explorer = await readFirstExisting([
      `${cache}/repomix-explorer/1.1.0/agents/explorer.md`,
      `${marketplace}/plugins/repomix-explorer/agents/explorer.md`,
      ...(repoCache ? [`${repoCache}/.claude/plugins/repomix-explorer/agents/explorer.md`] : []),
      `${root}/.fulcrum-vendor/repomix/agents/explorer.md`,
    ]);
    const exploreLocal = await readFirstExisting([
      `${cache}/repomix-explorer/1.1.0/commands/explore-local.md`,
      `${marketplace}/plugins/repomix-explorer/commands/explore-local.md`,
      ...(repoCache ? [`${repoCache}/.claude/plugins/repomix-explorer/commands/explore-local.md`] : []),
      `${root}/.fulcrum-vendor/repomix/commands/explore-local.md`,
    ]);
    const exploreRemote = await readFirstExisting([
      `${cache}/repomix-explorer/1.1.0/commands/explore-remote.md`,
      `${marketplace}/plugins/repomix-explorer/commands/explore-remote.md`,
      ...(repoCache ? [`${repoCache}/.claude/plugins/repomix-explorer/commands/explore-remote.md`] : []),
      `${root}/.fulcrum-vendor/repomix/commands/explore-remote.md`,
    ]);
    const mcpJson = await readFirstExisting([
      `${cache}/repomix-mcp/1.0.1/.mcp.json`,
      `${marketplace}/plugins/repomix-mcp/.mcp.json`,
      ...(repoCache ? [`${repoCache}/.claude/plugins/repomix-mcp/.mcp.json`] : []),
      `${root}/.fulcrum-vendor/repomix/.mcp.json`,
    ]);
    const rules = await readFirstExisting([
      `${home}/.claude/plugins/marketplaces/repomix/.agents/rules/base.md`,
      `${home}/.claude/plugins/marketplaces/repomix/AGENTS.md`,
      `${home}/.claude/plugins/marketplaces/repomix/CLAUDE.md`,
      ...(repoCache ? [`${repoCache}/.agents/rules/base.md`, `${repoCache}/AGENTS.md`, `${repoCache}/CLAUDE.md`] : []),
      `${root}/.fulcrum-vendor/repomix/rules/base.md`,
      `${root}/.fulcrum-vendor/repomix/AGENTS.md`,
    ]);
    if (!packLocal || !packRemote || !explorer || !exploreLocal || !exploreRemote || !mcpJson || !rules) return null;
    return { packLocal, packRemote, explorer, exploreLocal, exploreRemote, mcpJson, rules };
  };

  const local = await readSource(null);
  if (local) return local;
  const repoCache = await ensureRepomixRepoCache(home, dryRun);
  if (!repoCache) return null;
  const fromRepo = await readSource(repoCache);
  if (!fromRepo) return null;
  return fromRepo;
}

async function installGemini(home: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!(await exists(`${home}/.gemini`))) {
    console.log("     · skip Gemini Repomix package mirror (not detected)");
    return;
  }
  const root = `${home}/.gemini/extensions/repomix`;
  if (!dryRun) await rm(root, { recursive: true, force: true });
  await writeText(`${root}/gemini-extension.json`, JSON.stringify({
    name: "repomix",
    version: "1.0.0",
    mcpServers: {
      repomix: { command: "npx", args: ["-y", "repomix@latest", "--mcp"] },
    },
  }, null, 2) + "\n", dryRun);
  await writeText(`${root}/commands/pack-local.toml`, commandToml(PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/commands/pack-remote.toml`, commandToml(PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/commands/explore-local.toml`, commandToml(EXPLORE_LOCAL_DESCRIPTION, source.exploreLocal), dryRun);
  await writeText(`${root}/commands/explore-remote.toml`, commandToml(EXPLORE_REMOTE_DESCRIPTION, source.exploreRemote), dryRun);
  await writeText(`${root}/skills/${PACK_LOCAL}/SKILL.md`, skill(PACK_LOCAL, PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/skills/${PACK_REMOTE}/SKILL.md`, skill(PACK_REMOTE, PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/skills/${EXPLORER}/SKILL.md`, skill(EXPLORER, EXPLORER_DESCRIPTION, source.explorer), dryRun);
  await writeText(`${root}/skills/${EXPLORE_LOCAL}/SKILL.md`, skill(EXPLORE_LOCAL, EXPLORE_LOCAL_DESCRIPTION, source.exploreLocal), dryRun);
  await writeText(`${root}/skills/${EXPLORE_REMOTE}/SKILL.md`, skill(EXPLORE_REMOTE, EXPLORE_REMOTE_DESCRIPTION, source.exploreRemote), dryRun);
  await writeText(`${root}/agents/explorer.md`, geminiAgentFromClaude(source.explorer), dryRun);
  await writeText(`${root}/AGENTS.md`, source.rules.trim() + "\n", dryRun);
  await writeText(`${root}/rules/base.md`, source.rules.trim() + "\n", dryRun);
  await setGeminiMcpEnabled(home, "repomix", false, dryRun);
  console.log("     ✓ Gemini Repomix extension mirror installed");
}

async function writeRulesContext(root: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  const rules = source.rules.trim() + "\n";
  await writeText(`${root}/rules/repomix/base.md`, rules, dryRun);
  const agentsPath = `${root}/AGENTS.md`;
  if (dryRun) {
    console.log(`     [dry-run] would write: ${agentsPath}`);
    return;
  }
  const existing = (await exists(agentsPath)) ? await readFile(agentsPath, "utf8") : "";
  await mkdir(dirname(agentsPath), { recursive: true });
  await writeFile(agentsPath, upsertMarkedBlock(existing, rules));
}

async function removeRulesContext(root: string, label: string, dryRun: boolean): Promise<void> {
  await removePath(`${root}/rules/repomix`, `${label} Repomix rules mirror`, dryRun);
  const agentsPath = `${root}/AGENTS.md`;
  if (!(await exists(agentsPath))) return;
  if (dryRun) {
    console.log(`     [dry-run] would remove Repomix rules block from: ${agentsPath}`);
    return;
  }
  const next = removeMarkedBlock(await readFile(agentsPath, "utf8"));
  await writeFile(agentsPath, next ? `${next.trimEnd()}\n` : "");
}

async function installSkills(home: string, root: string, label: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!(await exists(dirname(root)))) {
    console.log(`     · skip ${label} Repomix skills (not detected)`);
    return;
  }
  if (!dryRun) {
    for (const name of [PACK_LOCAL, PACK_REMOTE, EXPLORER, EXPLORE_LOCAL, EXPLORE_REMOTE]) {
      await rm(`${root}/${name}`, { recursive: true, force: true });
    }
  }
  await writeText(`${root}/${PACK_LOCAL}/SKILL.md`, skill(PACK_LOCAL, PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/${PACK_REMOTE}/SKILL.md`, skill(PACK_REMOTE, PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/${EXPLORER}/SKILL.md`, skill(EXPLORER, EXPLORER_DESCRIPTION, source.explorer), dryRun);
  await writeText(`${root}/${EXPLORE_LOCAL}/SKILL.md`, skill(EXPLORE_LOCAL, EXPLORE_LOCAL_DESCRIPTION, source.exploreLocal), dryRun);
  await writeText(`${root}/${EXPLORE_REMOTE}/SKILL.md`, skill(EXPLORE_REMOTE, EXPLORE_REMOTE_DESCRIPTION, source.exploreRemote), dryRun);
  console.log(`     ✓ ${label} Repomix skills mirror installed`);
}

async function installCommandFiles(root: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!dryRun) await pruneGeneratedMarkdown(root, ["pack-local", "pack-remote", "explore-local", "explore-remote"]);
  await writeText(`${root}/pack-local.md`, packageCommand(PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/pack-remote.md`, packageCommand(PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/explore-local.md`, packageCommand(EXPLORE_LOCAL_DESCRIPTION, source.exploreLocal), dryRun);
  await writeText(`${root}/explore-remote.md`, packageCommand(EXPLORE_REMOTE_DESCRIPTION, source.exploreRemote), dryRun);
}

async function pruneGeneratedMarkdown(root: string, names: string[]): Promise<void> {
  for (const name of names) {
    await rm(`${root}/${name}.original.md`, { force: true });
    await rm(`${root}/${name}.backup.md`, { force: true });
    await rm(`${root}/${name}.source-only.md`, { force: true });
  }
  await rm(`${root}/source-only`, { recursive: true, force: true });
}

function codexPluginJson(): string {
  return JSON.stringify({
    name: "repomix",
    version: REPOMIX_CODEX_PLUGIN_VERSION,
    description: "Repomix package mirror for Codex: MCP config, commands, skills, explorer agent, and vendor rules.",
    author: { name: "yamadashy" },
    homepage: "https://repomix.com/docs/guide/claude-code-plugins",
    repository: REPOMIX_REPO,
    license: "MIT",
    keywords: ["repomix", "mcp", "codebase-analysis", "repository-analysis"],
    skills: "./skills/",
    interface: {
      displayName: "Repomix",
      shortDescription: "Pack and explore repositories with Repomix.",
      longDescription: "Repomix package mirror for Codex. Includes vendor-derived MCP, commands, skills, explorer agent, and rules.",
      developerName: "yamadashy",
      category: "Developer Tools",
      capabilities: ["Read", "Write"],
      websiteURL: "https://repomix.com",
      privacyPolicyURL: "https://github.com/yamadashy/repomix/blob/main/SECURITY.md",
      termsOfServiceURL: "https://github.com/yamadashy/repomix/blob/main/LICENSE",
      defaultPrompt: [
        "Use Repomix when packing or exploring local or remote repositories.",
      ],
      screenshots: [],
      brandColor: "#4F46E5",
    },
  }, null, 2) + "\n";
}

async function configureCodexRepomixPlugin(home: string, dryRun: boolean): Promise<void> {
  const configPath = `${home}/.codex/config.toml`;
  if (dryRun) {
    console.log(`     [dry-run] would enable Codex Repomix plugin in: ${configPath}`);
    return;
  }
  const existing = (await exists(configPath)) ? await readFile(configPath, "utf8") : "";
  let next = upsertTomlSection(existing, "[marketplaces.repomix]", [
    `source_type = "git"`,
    `source = "${REPOMIX_REPO}"`,
  ].join("\n"));
  next = upsertTomlSection(next, "[plugins.\"repomix@repomix\"]", "enabled = true");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${next.trimEnd()}\n`);
}

async function removeCodexRepomixPluginConfig(home: string, dryRun: boolean): Promise<void> {
  const configPath = `${home}/.codex/config.toml`;
  if (!(await exists(configPath))) return;
  if (dryRun) {
    console.log(`     [dry-run] would remove Codex Repomix plugin config from: ${configPath}`);
    return;
  }
  const existing = await readFile(configPath, "utf8");
  let next = removeTomlSection(existing, "[plugins.\"repomix@repomix\"]");
  next = removeTomlSection(next, "[marketplaces.repomix]");
  await writeFile(configPath, next ? `${next}\n` : "");
}

async function installCodexPluginMirror(home: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!(await exists(`${home}/.codex`))) {
    console.log("     · skip Codex Repomix plugin mirror (not detected)");
    return;
  }
  const root = `${home}/.codex/plugins/cache/repomix/repomix/${REPOMIX_CODEX_PLUGIN_VERSION}`;
  if (dryRun) {
    console.log(`     [dry-run] would refresh Codex Repomix plugin mirror: ${root}`);
  } else {
    await rm(root, { recursive: true, force: true });
  }
  await writeText(`${root}/.codex-plugin/plugin.json`, codexPluginJson(), dryRun);
  await writeText(`${root}/.mcp.json`, source.mcpJson.trim() + "\n", dryRun);
  await writeText(`${root}/commands/pack-local.md`, source.packLocal.trim() + "\n", dryRun);
  await writeText(`${root}/commands/pack-remote.md`, source.packRemote.trim() + "\n", dryRun);
  await writeText(`${root}/commands/explore-local.md`, source.exploreLocal.trim() + "\n", dryRun);
  await writeText(`${root}/commands/explore-remote.md`, source.exploreRemote.trim() + "\n", dryRun);
  await writeText(`${root}/agents/${EXPLORER}.md`, source.explorer.trim() + "\n", dryRun);
  await writeText(`${root}/AGENTS.md`, source.rules.trim() + "\n", dryRun);
  await writeText(`${root}/rules/base.md`, source.rules.trim() + "\n", dryRun);
  await writeText(`${root}/skills/${PACK_LOCAL}/SKILL.md`, skill(PACK_LOCAL, PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/skills/${PACK_REMOTE}/SKILL.md`, skill(PACK_REMOTE, PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/skills/${EXPLORER}/SKILL.md`, skill(EXPLORER, EXPLORER_DESCRIPTION, source.explorer), dryRun);
  await writeText(`${root}/skills/${EXPLORE_LOCAL}/SKILL.md`, skill(EXPLORE_LOCAL, EXPLORE_LOCAL_DESCRIPTION, source.exploreLocal), dryRun);
  await writeText(`${root}/skills/${EXPLORE_REMOTE}/SKILL.md`, skill(EXPLORE_REMOTE, EXPLORE_REMOTE_DESCRIPTION, source.exploreRemote), dryRun);
  await configureCodexRepomixPlugin(home, dryRun);
  console.log("     ✓ Codex Repomix plugin mirror installed");
}

async function installOpenCode(home: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!(await exists(`${home}/.config/opencode`))) {
    console.log("     · skip OpenCode Repomix package mirror (not detected)");
    return;
  }
  await rm(`${home}/.config/opencode/rules/base.original.md`, { force: true });
  await installSkills(home, `${home}/.config/opencode/skills`, "OpenCode", source, dryRun);
  await installCommandFiles(`${home}/.config/opencode/commands`, source, dryRun);
  await writeText(`${home}/.config/opencode/agents/${EXPLORER}.md`, opencodeAgentFromClaude(source.explorer), dryRun);
  await writeRulesContext(`${home}/.config/opencode`, source, dryRun);
  await writeText(`${home}/.config/opencode/packages/repomix/package.json`, JSON.stringify({
    name: "repomix",
    version: "1.0.0",
    private: true,
    description: "Fulcrum mirror metadata for Repomix OpenCode surfaces.",
    fulcrumMirror: {
      source: REPOMIX_REPO,
      surfaces: ["skills", "mcp", "commands", "explorer-agent", "rules"],
    },
  }, null, 2) + "\n", dryRun);
  console.log("     ✓ OpenCode Repomix agent mirror installed");
}

async function installPi(home: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!(await exists(`${home}/.pi/agent`))) {
    console.log("     · skip Pi CLI Repomix package mirror (not detected)");
    return;
  }
  await rm(`${home}/.pi/agent/rules/base.original.md`, { force: true });
  await installSkills(home, `${home}/.pi/agent/skills`, "Pi CLI", source, dryRun);
  await installCommandFiles(`${home}/.pi/agent/prompts`, source, dryRun);
  await writeRulesContext(`${home}/.pi/agent`, source, dryRun);
  await writeText(`${home}/.pi/agent/agents/${EXPLORER}.unsupported.md`, [
    "# Repomix explorer agent",
    "",
    "Pi has no native standalone explorer agent primitive to mirror Claude Code's Repomix explorer agent directly.",
    `Use /${EXPLORER} as a skill, or /explore-local and /explore-remote as prompt templates.`,
    "",
  ].join("\n"), dryRun);
  await writeText(`${home}/.pi/agent/packages/repomix/package.json`, JSON.stringify({
    name: "repomix",
    version: "1.0.0",
    private: true,
    keywords: ["pi-package", "repomix"],
    description: "Fulcrum mirror metadata for Repomix Pi surfaces.",
    pi: {
      skills: ["./skills"],
      prompts: ["./prompts"],
    },
    fulcrumMirror: {
      source: REPOMIX_REPO,
      surfaces: ["skills", "mcp", "prompts", "rules", "unsupported-explorer-agent"],
    },
  }, null, 2) + "\n", dryRun);
}

async function installRepomixMcpForPackage(dryRun: boolean, agents: readonly AgentId[] | undefined): Promise<void> {
  const registryAgents = selectedRegistryAgents(agents);
  if (registryAgents.length === 0) return;
  if (dryRun) {
    console.log(`     [dry-run] would register disabled Repomix MCP for ${registryAgents.join("/")}`);
    return;
  }
  const { registerServer, setEnabled, applyDisabledToAgents } = await import("./mcp-registry.ts");
  await registerServer("repomix", DEFAULT_REPOMIX_SERVER);
  await setEnabled("repomix", false, { agents: registryAgents });
  await applyDisabledToAgents("repomix", { agents: registryAgents });
}

async function removeRepomixMcpForPackage(dryRun: boolean, agents: readonly AgentId[] | undefined): Promise<void> {
  const registryAgents = selectedRegistryAgents(agents);
  if (registryAgents.length === 0) return;
  if (dryRun) {
    console.log(`     [dry-run] would remove Repomix MCP from ${registryAgents.join("/")}`);
    return;
  }
  const { loadRegistry, setEnabled, removeFromAgents } = await import("./mcp-registry.ts");
  const reg = await loadRegistry();
  if (!reg.servers["repomix"]) return;
  await setEnabled("repomix", false, { agents: registryAgents });
  await removeFromAgents("repomix", { agents: registryAgents });
}

export async function installRepomixPackageMirrors(opts: RepomixPackageOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  const targets = [
    selectedAgent(opts.agents, "codex") ? `${home}/.codex` : null,
    selectedAgent(opts.agents, "gemini") ? `${home}/.gemini` : null,
    selectedAgent(opts.agents, "opencode") ? `${home}/.config/opencode` : null,
    selectedAgent(opts.agents, "pi") ? `${home}/.pi/agent` : null,
  ].filter((path): path is string => path !== null);
  if (!(await Promise.all(targets.map((path) => exists(path)))).some(Boolean)) {
    console.log("     · skip Repomix package mirrors (no non-Claude agents detected)");
    return;
  }
  const source = await repomixSource(home, dryRun);
  if (!source) {
    if (dryRun) {
      await previewRepomixPackageMirrors(home);
      console.log("     [dry-run] Repomix package mirror plan unavailable until source cache exists");
    } else {
      console.log("     · skip Repomix package mirrors (vendor plugin source not available yet)");
    }
    return;
  }

  if (selectedAgent(opts.agents, "codex")) {
    await installSkills(home, `${home}/.codex/skills`, "Codex CLI", source, dryRun);
    await installCodexPluginMirror(home, source, dryRun);
  }
  if (selectedAgent(opts.agents, "gemini")) await installGemini(home, source, dryRun);
  if (selectedAgent(opts.agents, "opencode")) await installOpenCode(home, source, dryRun);
  if (selectedAgent(opts.agents, "pi")) await installPi(home, source, dryRun);
  await installRepomixMcpForPackage(dryRun, opts.agents);
  await writeMarker(home, REPOMIX_MIRRORS_MARKER_FILE, dryRun);
}

export async function uninstallRepomixPackageMirrors(opts: RepomixPackageOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  if (!dryRun && !(await markerPresent(home, REPOMIX_MIRRORS_MARKER_FILE))) {
    console.log("     · skip Repomix package mirrors removal (Fulcrum marker not present)");
    return;
  }
  if (selectedAgent(opts.agents, "gemini")) {
    await removePath(`${home}/.gemini/extensions/repomix`, "Gemini Repomix extension mirror", dryRun);
    await setGeminiMcpEnabled(home, "repomix", true, dryRun);
  }
  for (const root of [
    selectedAgent(opts.agents, "codex") ? `${home}/.codex/skills` : null,
    selectedAgent(opts.agents, "opencode") ? `${home}/.config/opencode/skills` : null,
    selectedAgent(opts.agents, "pi") ? `${home}/.pi/agent/skills` : null,
  ].filter((path): path is string => path !== null)) {
    await removePath(`${root}/${PACK_LOCAL}`, `Repomix skill ${PACK_LOCAL}`, dryRun);
    await removePath(`${root}/${PACK_REMOTE}`, `Repomix skill ${PACK_REMOTE}`, dryRun);
    await removePath(`${root}/${EXPLORER}`, `Repomix skill ${EXPLORER}`, dryRun);
    await removePath(`${root}/${EXPLORE_LOCAL}`, `Repomix skill ${EXPLORE_LOCAL}`, dryRun);
    await removePath(`${root}/${EXPLORE_REMOTE}`, `Repomix skill ${EXPLORE_REMOTE}`, dryRun);
  }
  if (selectedAgent(opts.agents, "codex")) {
    await removePath(`${home}/.codex/plugins/cache/repomix`, "Codex Repomix plugin mirror", dryRun);
    await removeCodexRepomixPluginConfig(home, dryRun);
  }
  if (selectedAgent(opts.agents, "opencode")) {
    await removePath(`${home}/.config/opencode/agents/${EXPLORER}.md`, "OpenCode Repomix agent mirror", dryRun);
  }
  for (const root of [
    selectedAgent(opts.agents, "opencode") ? `${home}/.config/opencode/commands` : null,
    selectedAgent(opts.agents, "pi") ? `${home}/.pi/agent/prompts` : null,
  ].filter((path): path is string => path !== null)) {
    await removePath(`${root}/pack-local.md`, "Repomix command pack-local", dryRun);
    await removePath(`${root}/pack-remote.md`, "Repomix command pack-remote", dryRun);
    await removePath(`${root}/explore-local.md`, "Repomix command explore-local", dryRun);
    await removePath(`${root}/explore-remote.md`, "Repomix command explore-remote", dryRun);
  }
  if (selectedAgent(opts.agents, "opencode")) {
    await removeRulesContext(`${home}/.config/opencode`, "OpenCode", dryRun);
    await removePath(`${home}/.config/opencode/packages/repomix`, "OpenCode Repomix package metadata", dryRun);
  }
  if (selectedAgent(opts.agents, "pi")) {
    await removeRulesContext(`${home}/.pi/agent`, "Pi CLI", dryRun);
    await removePath(`${home}/.pi/agent/agents/${EXPLORER}.unsupported.md`, "Pi CLI Repomix unsupported explorer note", dryRun);
    await removePath(`${home}/.pi/agent/packages/repomix`, "Pi CLI Repomix package metadata", dryRun);
  }
  await removeRepomixMcpForPackage(dryRun, opts.agents);
  await removePath(markerFile(home, REPOMIX_MIRRORS_MARKER_FILE), "Repomix package mirrors marker", dryRun);
}

async function previewRepomixPackageMirrors(home: string): Promise<void> {
  if (await exists(`${home}/.codex`)) {
    previewSkillWrites(`${home}/.codex/skills`);
  }
  if (await exists(`${home}/.gemini`)) {
    const root = `${home}/.gemini/extensions/repomix`;
    for (const path of [
      `${root}/gemini-extension.json`,
      `${root}/commands/pack-local.toml`,
      `${root}/commands/pack-remote.toml`,
      `${root}/commands/explore-local.toml`,
      `${root}/commands/explore-remote.toml`,
      `${root}/skills/${PACK_LOCAL}/SKILL.md`,
      `${root}/skills/${PACK_REMOTE}/SKILL.md`,
      `${root}/skills/${EXPLORER}/SKILL.md`,
      `${root}/skills/${EXPLORE_LOCAL}/SKILL.md`,
      `${root}/skills/${EXPLORE_REMOTE}/SKILL.md`,
      `${root}/agents/explorer.md`,
      `${root}/AGENTS.md`,
      `${root}/rules/base.md`,
    ]) {
      console.log(`     [dry-run] would write: ${path}`);
    }
  }
  if (await exists(`${home}/.config/opencode`)) {
    previewSkillWrites(`${home}/.config/opencode/skills`);
    for (const path of [
      `${home}/.config/opencode/commands/pack-local.md`,
      `${home}/.config/opencode/commands/pack-remote.md`,
      `${home}/.config/opencode/commands/explore-local.md`,
      `${home}/.config/opencode/commands/explore-remote.md`,
      `${home}/.config/opencode/AGENTS.md`,
      `${home}/.config/opencode/rules/repomix/base.md`,
      `${home}/.config/opencode/packages/repomix/package.json`,
    ]) {
      console.log(`     [dry-run] would write: ${path}`);
    }
    console.log(`     [dry-run] would write: ${home}/.config/opencode/agents/${EXPLORER}.md`);
  }
  if (await exists(`${home}/.pi/agent`)) {
    previewSkillWrites(`${home}/.pi/agent/skills`);
    for (const path of [
      `${home}/.pi/agent/prompts/pack-local.md`,
      `${home}/.pi/agent/prompts/pack-remote.md`,
      `${home}/.pi/agent/prompts/explore-local.md`,
      `${home}/.pi/agent/prompts/explore-remote.md`,
      `${home}/.pi/agent/AGENTS.md`,
      `${home}/.pi/agent/rules/repomix/base.md`,
      `${home}/.pi/agent/agents/${EXPLORER}.unsupported.md`,
      `${home}/.pi/agent/packages/repomix/package.json`,
    ]) {
      console.log(`     [dry-run] would write: ${path}`);
    }
  }
}

function previewSkillWrites(root: string): void {
  for (const name of [PACK_LOCAL, PACK_REMOTE, EXPLORER, EXPLORE_LOCAL, EXPLORE_REMOTE]) {
    console.log(`     [dry-run] would write: ${root}/${name}/SKILL.md`);
  }
}
