import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cloneOrUpdate, run as runProc, which } from "../utils/proc.ts";

const PACK_LOCAL = "repomix-pack-local";
const PACK_REMOTE = "repomix-pack-remote";
const EXPLORER = "repomix-explorer";
const REPOMIX_REPO = "https://github.com/yamadashy/repomix";
const REPOMIX_MARKETPLACE = "yamadashy/repomix";
const REPOMIX_MARKER_FILE = "repomix-claude.installed";
const REPOMIX_MIRRORS_MARKER_FILE = "repomix-mirrors.installed";
const REPOMIX_CLAUDE_PLUGINS = ["repomix-mcp", "repomix-commands", "repomix-explorer"] as const;

const PACK_LOCAL_DESCRIPTION = "Pack local codebases with Repomix";
const PACK_REMOTE_DESCRIPTION = "Pack remote repositories with Repomix";
const EXPLORER_DESCRIPTION = "Explore local or remote repositories using Repomix output";

interface RepomixPackageSource {
  packLocal: string;
  packRemote: string;
  explorer: string;
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

export async function installRepomixClaudePlugins(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
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

export async function uninstallRepomixClaudePlugins(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
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
    if (!packLocal || !packRemote || !explorer) return null;
    return { packLocal, packRemote, explorer };
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
  await writeText(`${root}/gemini-extension.json`, JSON.stringify({
    name: "repomix",
    version: "1.0.0",
    mcpServers: {
      repomix: { command: "npx", args: ["-y", "repomix@latest", "--mcp"] },
    },
  }, null, 2) + "\n", dryRun);
  await writeText(`${root}/commands/pack-local.toml`, commandToml(PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/commands/pack-remote.toml`, commandToml(PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/skills/${PACK_LOCAL}/SKILL.md`, skill(PACK_LOCAL, PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/skills/${PACK_REMOTE}/SKILL.md`, skill(PACK_REMOTE, PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/skills/${EXPLORER}/SKILL.md`, skill(EXPLORER, EXPLORER_DESCRIPTION, source.explorer), dryRun);
  await writeText(`${root}/agents/explorer.md`, geminiAgentFromClaude(source.explorer), dryRun);
  console.log("     ✓ Gemini Repomix extension mirror installed");
}

async function installSkills(home: string, root: string, label: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!(await exists(dirname(root)))) {
    console.log(`     · skip ${label} Repomix skills (not detected)`);
    return;
  }
  await writeText(`${root}/${PACK_LOCAL}/SKILL.md`, skill(PACK_LOCAL, PACK_LOCAL_DESCRIPTION, source.packLocal), dryRun);
  await writeText(`${root}/${PACK_REMOTE}/SKILL.md`, skill(PACK_REMOTE, PACK_REMOTE_DESCRIPTION, source.packRemote), dryRun);
  await writeText(`${root}/${EXPLORER}/SKILL.md`, skill(EXPLORER, EXPLORER_DESCRIPTION, source.explorer), dryRun);
  console.log(`     ✓ ${label} Repomix skills mirror installed`);
}

async function installOpenCode(home: string, source: RepomixPackageSource, dryRun: boolean): Promise<void> {
  if (!(await exists(`${home}/.config/opencode`))) {
    console.log("     · skip OpenCode Repomix package mirror (not detected)");
    return;
  }
  await installSkills(home, `${home}/.config/opencode/skills`, "OpenCode", source, dryRun);
  await writeText(`${home}/.config/opencode/agents/${EXPLORER}.md`, opencodeAgentFromClaude(source.explorer), dryRun);
  console.log("     ✓ OpenCode Repomix agent mirror installed");
}

export async function installRepomixPackageMirrors(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  const targets = [
    `${home}/.codex`,
    `${home}/.gemini`,
    `${home}/.config/opencode`,
    `${home}/.pi/agent`,
  ];
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

  await installSkills(home, `${home}/.codex/skills`, "Codex CLI", source, dryRun);
  await installGemini(home, source, dryRun);
  await installOpenCode(home, source, dryRun);
  await installSkills(home, `${home}/.pi/agent/skills`, "Pi CLI", source, dryRun);
  await writeMarker(home, REPOMIX_MIRRORS_MARKER_FILE, dryRun);
}

export async function uninstallRepomixPackageMirrors(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  if (!dryRun && !(await markerPresent(home, REPOMIX_MIRRORS_MARKER_FILE))) {
    console.log("     · skip Repomix package mirrors removal (Fulcrum marker not present)");
    return;
  }
  await removePath(`${home}/.gemini/extensions/repomix`, "Gemini Repomix extension mirror", dryRun);
  for (const root of [
    `${home}/.codex/skills`,
    `${home}/.config/opencode/skills`,
    `${home}/.pi/agent/skills`,
  ]) {
    await removePath(`${root}/${PACK_LOCAL}`, `Repomix skill ${PACK_LOCAL}`, dryRun);
    await removePath(`${root}/${PACK_REMOTE}`, `Repomix skill ${PACK_REMOTE}`, dryRun);
    await removePath(`${root}/${EXPLORER}`, `Repomix skill ${EXPLORER}`, dryRun);
  }
  await removePath(`${home}/.config/opencode/agents/${EXPLORER}.md`, "OpenCode Repomix agent mirror", dryRun);
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
      `${root}/skills/${PACK_LOCAL}/SKILL.md`,
      `${root}/skills/${PACK_REMOTE}/SKILL.md`,
      `${root}/skills/${EXPLORER}/SKILL.md`,
      `${root}/agents/explorer.md`,
    ]) {
      console.log(`     [dry-run] would write: ${path}`);
    }
  }
  if (await exists(`${home}/.config/opencode`)) {
    previewSkillWrites(`${home}/.config/opencode/skills`);
    console.log(`     [dry-run] would write: ${home}/.config/opencode/agents/${EXPLORER}.md`);
  }
  if (await exists(`${home}/.pi/agent`)) {
    previewSkillWrites(`${home}/.pi/agent/skills`);
  }
}

function previewSkillWrites(root: string): void {
  for (const name of [PACK_LOCAL, PACK_REMOTE, EXPLORER]) {
    console.log(`     [dry-run] would write: ${root}/${name}/SKILL.md`);
  }
}
