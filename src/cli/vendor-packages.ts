import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AGENTS } from "../agents/registry.ts";
import { cloneOrUpdate, run as runProc, which } from "../utils/proc.ts";

const CLOUDFLARE_MARKETPLACE = "cloudflare/skills";
const CLOUDFLARE_PLUGIN = "cloudflare@cloudflare";
const CLOUDFLARE_CLAUDE_MARKER = "cloudflare-claude.installed";

const SUPERPOWERS_REPO = "https://github.com/obra/superpowers";
const SUPERPOWERS_CLAUDE_PLUGIN = "superpowers@claude-plugins-official";
const SUPERPOWERS_GEMINI_EXTENSION = "https://github.com/obra/superpowers";
const SUPERPOWERS_OPENCODE_PLUGIN = "superpowers@git+https://github.com/obra/superpowers.git";
const SUPERPOWERS_CLAUDE_MARKER = "superpowers-claude.installed";
const SUPERPOWERS_GEMINI_MARKER = "superpowers-gemini.installed";
const SUPERPOWERS_OPENCODE_MARKER = "superpowers-opencode.installed";
const SUPERPOWERS_PI_MARKER = "superpowers-pi.installed";
const SUPERPOWERS_PI_PACKAGES = [
  "https://github.com/obra/superpowers",
  "npm:@tintinweb/pi-subagents",
  "npm:@uadgj/pi-superpowers-support",
] as const;

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function isDir(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

function homeDir(): string {
  return process.env["HOME"] ?? "";
}

function fulcrumHome(home: string): string {
  return process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
}

function markerPath(home: string, marker: string): string {
  return `${fulcrumHome(home)}/state/global/${marker}`;
}

async function hasMarker(home: string, marker: string): Promise<boolean> {
  return exists(markerPath(home, marker));
}

async function writeMarker(home: string, marker: string, dryRun: boolean): Promise<void> {
  const path = markerPath(home, marker);
  if (dryRun) {
    console.log(`     [dry-run] would write marker: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, new Date().toISOString() + "\n");
}

async function removeMarker(home: string, marker: string, label: string, dryRun: boolean): Promise<void> {
  await removePath(markerPath(home, marker), `${label} marker`, dryRun);
}

async function runBestEffort(cmd: string[], label: string, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    console.log(`     [dry-run] would run: ${cmd.join(" ")}`);
    return true;
  }
  const r = await runProc(cmd, { timeoutMs: 60_000 });
  if (r.exit !== 0) {
    console.log(`     · ${label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()}`);
    return false;
  }
  console.log(`     ✓ ${label}`);
  return true;
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

async function clonePackage(repo: string, dir: string, dryRun: boolean): Promise<string | null> {
  if (await exists(`${dir}/skills`)) return dir;
  if (dryRun) {
    console.log(`     [dry-run] would clone/update ${repo} → ${dir}`);
    return dir;
  }
  await mkdir(dirname(dir), { recursive: true });
  const r = await cloneOrUpdate(repo, dir);
  if (r.exit !== 0) {
    console.log(`     · ${repo} clone/update failed: ${r.stderr.trim()}`);
    return null;
  }
  return dir;
}

async function copyTree(src: string, dst: string, dryRun: boolean): Promise<void> {
  if (dryRun) console.log(`     [dry-run] would mkdir: ${dst}`);
  else await mkdir(dst, { recursive: true });

  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(s, d, dryRun);
    } else if (entry.isFile()) {
      if (dryRun) console.log(`     [dry-run] would copy: ${s} → ${d}`);
      else await copyFile(s, d);
    }
  }
}

async function installClaudePlugin(
  home: string,
  label: string,
  pluginName: string,
  dryRun: boolean,
  marker: string,
  marketplace?: string,
): Promise<void> {
  if (!(await isDir(`${home}/.claude`))) {
    console.log(`     · skip ${label} Claude plugin (Claude Code not detected)`);
    return;
  }
  if (dryRun) {
    if (marketplace) {
      await runBestEffort(["claude", "plugin", "marketplace", "add", marketplace], `${label} Claude marketplace add`, true);
    }
    await runBestEffort(["claude", "plugin", "install", pluginName], `${label} Claude plugin install`, true);
    await writeMarker(home, marker, true);
    return;
  }
  if (!(await which("claude"))) {
    const marketplaceHint = marketplace ? `claude plugin marketplace add ${marketplace} && ` : "";
    console.log(`     · skip ${label} Claude plugin (claude not on PATH) — manual: ${marketplaceHint}claude plugin install ${pluginName}`);
    return;
  }
  let ok = true;
  if (marketplace) {
    ok = await runBestEffort(["claude", "plugin", "marketplace", "add", marketplace], `${label} Claude marketplace add`, false);
  }
  ok = (await runBestEffort(["claude", "plugin", "install", pluginName], `${label} Claude plugin install`, false)) && ok;
  if (ok) await writeMarker(home, marker, false);
}

async function uninstallClaudePlugin(home: string, label: string, pluginName: string, dryRun: boolean, marker: string): Promise<void> {
  if (!(await isDir(`${home}/.claude`))) return;
  if (!dryRun && !(await hasMarker(home, marker))) {
    console.log(`     · skip ${label} Claude plugin uninstall (Fulcrum marker not present)`);
    return;
  }
  if (dryRun) {
    await runBestEffort(["claude", "plugin", "uninstall", pluginName], `${label} Claude plugin uninstall`, true);
    await removeMarker(home, marker, `${label} Claude plugin`, true);
    return;
  }
  if (!(await which("claude"))) {
    console.log(`     · ${label}: claude not on PATH — manual: claude plugin uninstall ${pluginName}`);
    return;
  }
  if (await runBestEffort(["claude", "plugin", "uninstall", pluginName], `${label} Claude plugin uninstall`, false)) {
    await removeMarker(home, marker, `${label} Claude plugin`, false);
  }
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

async function writeJson(path: string, data: Record<string, unknown>, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`     [dry-run] would write: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

async function addOpenCodePlugin(home: string, dryRun: boolean): Promise<void> {
  const dir = `${home}/.config/opencode`;
  if (!(await isDir(dir))) {
    console.log("     · skip Superpowers OpenCode plugin (OpenCode not detected)");
    return;
  }
  const file = `${dir}/opencode.json`;
  const cfg = await readJsonObject(file);
  const current = Array.isArray(cfg["plugin"]) ? cfg["plugin"] : [];
  if (!current.includes(SUPERPOWERS_OPENCODE_PLUGIN)) {
    cfg["plugin"] = [...current, SUPERPOWERS_OPENCODE_PLUGIN];
    await writeJson(file, cfg, dryRun);
    await writeMarker(home, SUPERPOWERS_OPENCODE_MARKER, dryRun);
    console.log("     ✓ Superpowers OpenCode plugin registered");
  } else {
    console.log("     · Superpowers OpenCode plugin already registered");
  }
}

async function removeOpenCodePlugin(home: string, dryRun: boolean): Promise<void> {
  const file = `${home}/.config/opencode/opencode.json`;
  if (!(await exists(file))) return;
  if (!dryRun && !(await hasMarker(home, SUPERPOWERS_OPENCODE_MARKER))) {
    console.log("     · skip Superpowers OpenCode plugin removal (Fulcrum marker not present)");
    return;
  }
  const cfg = await readJsonObject(file);
  const plugins = Array.isArray(cfg["plugin"]) ? cfg["plugin"] : null;
  if (!plugins) return;
  cfg["plugin"] = plugins.filter((value) => value !== SUPERPOWERS_OPENCODE_PLUGIN);
  if ((cfg["plugin"] as unknown[]).length === 0) delete cfg["plugin"];
  await writeJson(file, cfg, dryRun);
  await removeMarker(home, SUPERPOWERS_OPENCODE_MARKER, "Superpowers OpenCode plugin", dryRun);
  console.log("     - Superpowers OpenCode plugin registration removed");
}

async function installGeminiSuperpowers(home: string, dryRun: boolean): Promise<void> {
  const geminiDir = `${home}/.gemini`;
  const extensionDir = `${geminiDir}/extensions/superpowers`;
  if (!(await isDir(geminiDir))) {
    console.log("     · skip Superpowers Gemini extension (Gemini not detected)");
    return;
  }
  if (await isDir(extensionDir)) {
    console.log("     · Superpowers Gemini extension already installed");
    return;
  }
  if (dryRun) {
    await runBestEffort(
      ["gemini", "extensions", "install", SUPERPOWERS_GEMINI_EXTENSION, "--consent", "--skip-settings"],
      "Superpowers Gemini extension install",
      true,
    );
    await writeMarker(home, SUPERPOWERS_GEMINI_MARKER, true);
    return;
  }
  if (!(await which("gemini"))) {
    console.log(`     · skip Superpowers Gemini extension (gemini not on PATH) — manual: gemini extensions install ${SUPERPOWERS_GEMINI_EXTENSION} --consent --skip-settings`);
    return;
  }
  await runBestEffort(
    ["gemini", "extensions", "install", SUPERPOWERS_GEMINI_EXTENSION, "--consent", "--skip-settings"],
    "Superpowers Gemini extension install",
    dryRun,
  ) && await writeMarker(home, SUPERPOWERS_GEMINI_MARKER, false);
}

async function uninstallGeminiSuperpowers(home: string, dryRun: boolean): Promise<void> {
  const extensionDir = `${home}/.gemini/extensions/superpowers`;
  if (!(await exists(extensionDir))) {
    console.log("     · Superpowers Gemini extension not present");
    return;
  }
  if (!dryRun && !(await hasMarker(home, SUPERPOWERS_GEMINI_MARKER))) {
    console.log("     · skip Superpowers Gemini extension uninstall (Fulcrum marker not present)");
    return;
  }
  if (dryRun) {
    await runBestEffort(["gemini", "extensions", "uninstall", "superpowers"], "Superpowers Gemini extension uninstall", true);
    await removePath(extensionDir, "Superpowers Gemini extension", true);
    await removeMarker(home, SUPERPOWERS_GEMINI_MARKER, "Superpowers Gemini extension", true);
    return;
  }
  if (await which("gemini")) {
    await runBestEffort(["gemini", "extensions", "uninstall", "superpowers"], "Superpowers Gemini extension uninstall", dryRun);
  } else {
    console.log("     · Superpowers Gemini extension: gemini not on PATH");
  }
  await removePath(extensionDir, "Superpowers Gemini extension", dryRun);
  await removeMarker(home, SUPERPOWERS_GEMINI_MARKER, "Superpowers Gemini extension", dryRun);
}

async function installSuperpowersSkillMirror(home: string, agentId: "codex" | "pi", dryRun: boolean): Promise<void> {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  if (!(await isDir(agent.rootDir(home)))) {
    console.log(`     · skip Superpowers ${agent.label} skill mirror (not detected)`);
    return;
  }
  const repo = await clonePackage(SUPERPOWERS_REPO, `${fulcrumHome(home)}/cache/superpowers`, dryRun);
  if (!repo) return;
  const src = `${repo}/skills`;
  if (!(await isDir(src))) {
    if (dryRun) {
      console.log("     [dry-run] Superpowers skills mirror plan unavailable until source cache exists");
    } else {
      console.log("     · Superpowers skills source unavailable");
    }
    return;
  }
  const dst = `${agent.skillsDir(home)}/superpowers`;
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = `${src}/${entry.name}`;
    if (!(await exists(`${skillDir}/SKILL.md`))) continue;
    await copyTree(skillDir, `${dst}/${entry.name}`, dryRun);
  }
  console.log(`     ✓ ${agent.label} Superpowers full skill mirror installed`);
}

async function installPiSuperpowersPackage(home: string, dryRun: boolean): Promise<void> {
  const agent = AGENTS.find((a) => a.id === "pi")!;
  if (!(await isDir(agent.rootDir(home)))) {
    console.log("     · skip Superpowers Pi packages (Pi not detected)");
    return;
  }
  if (dryRun) {
    for (const pkg of SUPERPOWERS_PI_PACKAGES) {
      await runBestEffort(["pi", "install", pkg], `Superpowers Pi package install ${pkg}`, true);
    }
    await writeMarker(home, SUPERPOWERS_PI_MARKER, true);
    return;
  }
  if (!(await which("pi"))) {
    console.log("     · pi not on PATH — using Superpowers Pi skill mirror fallback");
    await installSuperpowersSkillMirror(home, "pi", dryRun);
    return;
  }
  let allOk = true;
  for (const pkg of SUPERPOWERS_PI_PACKAGES) {
    allOk = (await runBestEffort(["pi", "install", pkg], `Superpowers Pi package install ${pkg}`, false)) && allOk;
  }
  if (allOk) await writeMarker(home, SUPERPOWERS_PI_MARKER, false);
}

async function uninstallPiSuperpowersPackage(home: string, dryRun: boolean): Promise<void> {
  const settings = await readJsonObject(`${home}/.pi/agent/settings.json`);
  const installed = Array.isArray(settings["packages"]) ? settings["packages"] : [];
  if (dryRun) {
    for (const pkg of SUPERPOWERS_PI_PACKAGES) {
      await runBestEffort(["pi", "remove", pkg], `Superpowers Pi package remove ${pkg}`, true);
    }
    await removeMarker(home, SUPERPOWERS_PI_MARKER, "Superpowers Pi packages", true);
  } else if (!(await hasMarker(home, SUPERPOWERS_PI_MARKER))) {
    console.log("     · skip Superpowers Pi package removal (Fulcrum marker not present)");
  } else if (await which("pi")) {
    for (const pkg of SUPERPOWERS_PI_PACKAGES) {
      if (!installed.includes(pkg)) {
        console.log(`     · Superpowers Pi package ${pkg} not present`);
        continue;
      }
      await runBestEffort(["pi", "remove", pkg], `Superpowers Pi package remove ${pkg}`, dryRun);
    }
    await removeMarker(home, SUPERPOWERS_PI_MARKER, "Superpowers Pi packages", false);
  } else {
    console.log("     · Superpowers Pi packages: pi not on PATH");
  }
  await removePath(`${home}/.pi/agent/skills/superpowers`, "Pi Superpowers skill mirror", dryRun);
}

export async function installCloudflarePackage(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  await installClaudePlugin(home, "Cloudflare", CLOUDFLARE_PLUGIN, dryRun, CLOUDFLARE_CLAUDE_MARKER, CLOUDFLARE_MARKETPLACE);
}

export async function uninstallCloudflarePackage(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  await uninstallClaudePlugin(home, "Cloudflare", CLOUDFLARE_PLUGIN, dryRun, CLOUDFLARE_CLAUDE_MARKER);
}

export async function installSuperpowersPackage(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  await installClaudePlugin(home, "Superpowers", SUPERPOWERS_CLAUDE_PLUGIN, dryRun, SUPERPOWERS_CLAUDE_MARKER);
  await installGeminiSuperpowers(home, dryRun);
  await addOpenCodePlugin(home, dryRun);
  await installSuperpowersSkillMirror(home, "codex", dryRun);
  await installPiSuperpowersPackage(home, dryRun);
}

export async function uninstallSuperpowersPackage(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  await uninstallClaudePlugin(home, "Superpowers", SUPERPOWERS_CLAUDE_PLUGIN, dryRun, SUPERPOWERS_CLAUDE_MARKER);
  await uninstallGeminiSuperpowers(home, dryRun);
  await removeOpenCodePlugin(home, dryRun);
  await removePath(`${home}/.codex/skills/superpowers`, "Codex Superpowers skill mirror", dryRun);
  await uninstallPiSuperpowersPackage(home, dryRun);
}

export async function installVendorCapabilityPackages(opts: { dryRun?: boolean } = {}): Promise<void> {
  await installCloudflarePackage(opts);
  await installSuperpowersPackage(opts);
}

export async function uninstallVendorCapabilityPackages(opts: { dryRun?: boolean } = {}): Promise<void> {
  await uninstallCloudflarePackage(opts);
  await uninstallSuperpowersPackage(opts);
}
