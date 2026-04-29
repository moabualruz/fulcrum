import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cloneOrUpdate } from "../utils/proc.ts";

const PACK_LOCAL = "repomix-pack-local";
const PACK_REMOTE = "repomix-pack-remote";
const EXPLORER = "repomix-explorer";
const REPOMIX_REPO = "https://github.com/yamadashy/repomix";

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

function repoRoot(): string {
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

function fulcrumHome(home: string): string {
  return process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
}

function pluginCacheRoot(home: string): string {
  return `${home}/.claude/plugins/cache/repomix`;
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
  await writeText(`${root}/agents/explorer.md`, source.explorer.trim() + "\n", dryRun);
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
    console.log("     · skip Repomix package mirrors (vendor plugin source not available yet)");
    return;
  }

  await installSkills(home, `${home}/.codex/skills`, "Codex CLI", source, dryRun);
  await installGemini(home, source, dryRun);
  await installOpenCode(home, source, dryRun);
  await installSkills(home, `${home}/.pi/agent/skills`, "Pi CLI", source, dryRun);
}

export async function uninstallRepomixPackageMirrors(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
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
}
