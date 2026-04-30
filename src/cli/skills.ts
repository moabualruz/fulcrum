// fulcrum skills sync — fan out authored skills to agent-native surfaces.
// fulcrum skills lint <path> — validate frontmatter (+ body section presence)
// against the strictest union of all 5 agents' rules.
// fulcrum skills list — enumerate authored skills with name, desc preview, eval coverage.
// fulcrum skills upstream — sync curated third-party skills.

import { mkdir, readdir, readFile, copyFile, writeFile, stat, rm, rename } from "node:fs/promises";
import { join, basename, dirname, resolve } from "node:path";
import { AGENTS } from "../agents/registry.ts";
import type { AgentId } from "./mcp-registry.ts";
import { which, run as runProc } from "../utils/proc.ts";
import { pruneSourceBackupFiles } from "../utils/source-clean.ts";

function repoRoot(): string {
  // When invoked from a clone, this binary's enclosing repo is the source of
  // truth. Override with FULCRUM_REPO_DIR.
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

// ── sync ───────────────────────────────────────────────────────────────
//
// Per-agent install layouts:
//   Claude Code → plugin (`claude plugin install fulcrum@fulcrum`); skills surfaced
//                 as `/fulcrum:<name>`. Claude Code's loader scans top-level of
//                 ~/.claude/skills/ only (no nested discovery), so the
//                 `<dir>/fulcrum/<name>/` layout other agents use does not work
//                 there. Plugin namespace is the supported path.
//   Codex CLI / OpenCode / Pi → `<skillsDir>/fulcrum/<name>/SKILL.md` (these
//                 loaders walk nested dirs).
//   Gemini CLI  → `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md`
//                 (extension itself is the namespace).

const NAMESPACE = "fulcrum";
const PLUGIN_MARKETPLACE = "moabualruz/fulcrum";
const PLUGIN_SPEC = "fulcrum@fulcrum";

export type CodexSkillScope = "skip" | "global" | "project";

interface SyncSkillsOptions {
  dryRun?: boolean;
  codexScope?: CodexSkillScope;
  projectDir?: string;
  agents?: readonly AgentId[];
}

// Skip patterns: .original.md backups are human-edit source-of-truth — agents
// read the compressed .md only. Also skip .git, node_modules just in case.
function shouldSkipForSync(name: string): boolean {
  if (name.endsWith(".original.md")) return true;
  if (name === "_archive" || name === "_template") return true;
  if (name === ".claude" || name === ".git" || name === "node_modules" || name === "worktrees") return true;
  return false;
}

async function copyFileAtomic(src: string, dst: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  if (opts.dryRun) {
    console.log(`    [dry-run] would copy: ${src} → ${dst}`);
    return;
  }
  await mkdir(dirname(dst), { recursive: true });
  const tmp = `${dst}.fulcrum-sync-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await copyFile(src, tmp);
    await rename(tmp, dst);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

async function pruneUnexpectedEntries(
  dst: string,
  expected: ReadonlySet<string>,
  opts: { dryRun?: boolean } = {},
): Promise<void> {
  if (!(await isDir(dst))) return;
  for (const entry of await readdir(dst, { withFileTypes: true })) {
    if (expected.has(entry.name)) continue;
    const path = join(dst, entry.name);
    if (opts.dryRun) {
      console.log(`    [dry-run] would remove stale: ${path}`);
    } else {
      await rm(path, { recursive: true, force: true });
    }
  }
}

async function syncTreeInPlace(src: string, dst: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  if (opts.dryRun) {
    console.log(`    [dry-run] would mkdir: ${dst}`);
  } else {
    const dstStat = await stat(dst).catch(() => null);
    if (dstStat && !dstStat.isDirectory()) {
      await rm(dst, { recursive: true, force: true });
    }
    await mkdir(dst, { recursive: true });
  }
  const expected = new Set<string>();
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (shouldSkipForSync(entry.name)) continue;
    expected.add(entry.name);
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      await syncTreeInPlace(s, d, opts);
    } else {
      if (!opts.dryRun) {
        const dstStat = await stat(d).catch(() => null);
        if (dstStat?.isDirectory()) {
          await rm(d, { recursive: true, force: true });
        }
      }
      await copyFileAtomic(s, d, opts);
    }
  }
  await pruneUnexpectedEntries(dst, expected, opts);
}

async function authoredSkillNames(skillsSrc: string): Promise<string[]> {
  const skills: string[] = [];
  for (const entry of await readdir(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "_template") continue;
    if (entry.name === "_archive") continue;
    if (await exists(`${skillsSrc}/${entry.name}/SKILL.md`)) {
      skills.push(entry.name);
    }
  }
  return skills;
}

async function syncSkillSet(
  skills: readonly string[],
  skillsSrc: string,
  dstRoot: string,
  opts: { dryRun?: boolean },
  printedPrefix = "",
): Promise<void> {
  if (opts.dryRun) {
    console.log(`    [dry-run] would mkdir: ${dstRoot}`);
  } else {
    await mkdir(dstRoot, { recursive: true });
  }
  const expected = new Set(skills);
  for (const name of skills) {
    const dst = `${dstRoot}/${name}`;
    await syncTreeInPlace(`${skillsSrc}/${name}`, dst, opts);
    console.log(`    ${printedPrefix}${name}`);
  }
  await pruneUnexpectedEntries(dstRoot, expected, opts);
}

async function claudePluginVersion(root: string): Promise<string> {
  try {
    const plugin = JSON.parse(await readFile(`${root}/.claude-plugin/plugin.json`, "utf8"));
    return typeof plugin?.version === "string" ? plugin.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

async function refreshClaudePluginPackage(root: string, opts: { dryRun: boolean }): Promise<void> {
  const home = process.env["HOME"] ?? "";
  const version = await claudePluginVersion(root);
  const src = `${root}/skills`;
  const cacheSkills = `${home}/.claude/plugins/cache/fulcrum/fulcrum/${version}/skills`;
  const marketplaceSkills = `${home}/.claude/plugins/marketplaces/fulcrum/plugins/fulcrum/skills`;

  if (!(await isDir(src))) return;
  const skills = await authoredSkillNames(src);
  for (const dst of [cacheSkills, marketplaceSkills]) {
    await syncSkillSet(skills, src, dst, opts);
    console.log(`    ✓ refreshed plugin skills: ${dst}`);
  }
  await pruneSourceBackupFiles(`${home}/.claude/plugins/cache/fulcrum`, {
    dryRun: opts.dryRun,
    label: "Claude Code fulcrum plugin cache",
    log: true,
  });
  await pruneSourceBackupFiles(`${home}/.claude/plugins/marketplaces/fulcrum`, {
    dryRun: opts.dryRun,
    label: "Claude Code fulcrum marketplace cache",
    log: true,
  });
}

async function installClaudePlugin(root: string, opts: { dryRun: boolean }): Promise<void> {
  const home = process.env["HOME"] ?? "";
  // Idempotency: if plugin already registered in installed_plugins.json, skip.
  const installedPath = `${home}/.claude/plugins/installed_plugins.json`;
  if (await exists(installedPath)) {
    try {
      const data = JSON.parse(await readFile(installedPath, "utf8"));
      if (data?.plugins?.[PLUGIN_SPEC]) {
        console.log(`    · ${PLUGIN_SPEC} already installed`);
        await refreshClaudePluginPackage(root, { dryRun: opts.dryRun });
        return;
      }
    } catch { /* malformed — fall through to install */ }
  }

  if (!(await which("claude"))) {
    console.log(`    · claude not on PATH — manual: claude plugin marketplace add ${PLUGIN_MARKETPLACE} && claude plugin install ${PLUGIN_SPEC}`);
    return;
  }

  if (opts.dryRun) {
    console.log(`    [dry-run] would run: claude plugin marketplace add ${PLUGIN_MARKETPLACE}`);
    console.log(`    [dry-run] would run: claude plugin install ${PLUGIN_SPEC}`);
    return;
  }

  const r1 = await runProc(["claude", "plugin", "marketplace", "add", PLUGIN_MARKETPLACE], { timeoutMs: 60_000 });
  if (r1.exit !== 0) {
    console.log(`    ✗ marketplace add failed: ${r1.stderr.trim() || r1.stdout.trim()}`);
    console.log(`      manual: claude plugin marketplace add ${PLUGIN_MARKETPLACE}`);
    return;
  }
  console.log(`    ✓ marketplace added: ${PLUGIN_MARKETPLACE}`);

  const r2 = await runProc(["claude", "plugin", "install", PLUGIN_SPEC], { timeoutMs: 60_000 });
  if (r2.exit !== 0) {
    console.log(`    ✗ plugin install failed: ${r2.stderr.trim() || r2.stdout.trim()}`);
    console.log(`      manual: claude plugin install ${PLUGIN_SPEC}`);
    return;
  }
  console.log(`    ✓ plugin installed: ${PLUGIN_SPEC} (skills available as /fulcrum:<name>)`);
  await refreshClaudePluginPackage(root, { dryRun: opts.dryRun });
}

async function cleanupLegacyClaudeSkills(opts: { dryRun: boolean }): Promise<void> {
  const home = process.env["HOME"] ?? "";
  const legacy = `${home}/.claude/skills/${NAMESPACE}`;
  if (!(await isDir(legacy))) return;
  if (opts.dryRun) {
    console.log(`    [dry-run] would remove legacy layout: ${legacy}`);
    return;
  }
  await rm(legacy, { recursive: true, force: true });
  console.log(`    ✓ removed legacy layout: ${legacy}`);
}

async function removeDirIfPresent(path: string, opts: { dryRun: boolean; label: string }): Promise<void> {
  if (!(await isDir(path))) return;
  if (opts.dryRun) {
    console.log(`    [dry-run] would remove ${opts.label}: ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
  console.log(`    ✓ removed ${opts.label}: ${path}`);
}

async function uninstallClaudeFulcrumPlugin(opts: { dryRun: boolean }): Promise<void> {
  const cmd = ["claude", "plugin", "uninstall", PLUGIN_SPEC];
  if (opts.dryRun) {
    console.log(`    [dry-run] would run: ${cmd.join(" ")}`);
    return;
  }
  if (!(await which("claude"))) {
    console.log(`    · claude not on PATH — skip plugin uninstall (${PLUGIN_SPEC})`);
    return;
  }
  const result = await runProc(cmd, { timeoutMs: 60_000 });
  if (result.exit === 0) {
    console.log(`    ✓ plugin uninstalled: ${PLUGIN_SPEC}`);
  } else {
    console.log(`    · plugin uninstall skipped/failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

function selectedAgent(opts: { agents?: readonly AgentId[] }, agentId: AgentId): boolean {
  return opts.agents === undefined || opts.agents.includes(agentId);
}

export async function removeAuthoredSkills(opts: { dryRun?: boolean; agents?: readonly AgentId[] } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";

  console.log("fulcrum skills remove — authored skill surfaces\n");

  const claudeAgent = AGENTS.find((a) => a.id === "claude-code")!;
  if (selectedAgent(opts, "claude-code") && await isDir(claudeAgent.baseDir(home))) {
    console.log(`→ Claude Code (${PLUGIN_SPEC})`);
    await uninstallClaudeFulcrumPlugin({ dryRun });
    await removeDirIfPresent(`${claudeAgent.skillsDir(home)}/${NAMESPACE}`, { dryRun, label: "legacy layout" });
    await removeDirIfPresent(`${home}/.claude/plugins/cache/fulcrum`, { dryRun, label: "plugin cache" });
    await removeDirIfPresent(`${home}/.claude/plugins/marketplaces/fulcrum`, { dryRun, label: "marketplace cache" });
    console.log();
  }

  for (const agent of AGENTS) {
    if (agent.id === "claude-code" || agent.id === "gemini") continue;
    if (!selectedAgent(opts, agent.id)) continue;
    const path = `${agent.skillsDir(home)}/${NAMESPACE}`;
    if (!(await isDir(path))) continue;
    console.log(`→ ${agent.label}`);
    await removeDirIfPresent(path, { dryRun, label: "authored namespace" });
    console.log();
  }

  const geminiAgent = AGENTS.find((a) => a.id === "gemini")!;
  const geminiExtension = geminiAgent.skillsDir(home).replace(/\/skills$/, "");
  if (selectedAgent(opts, "gemini") && await isDir(geminiExtension)) {
    console.log("→ Gemini CLI");
    await removeDirIfPresent(geminiExtension, { dryRun, label: "authored extension" });
    console.log();
  }

  console.log("Done.");
}

interface SkillTarget {
  path: string;
  label: string;
  projectLocal?: boolean;
}

function skillTargets(home: string, opts: SyncSkillsOptions): { targets: SkillTarget[]; skippedCodex: boolean } {
  const codexScope = opts.codexScope ?? (
    process.env["FULCRUM_CODEX_SKILLS_SCOPE"] === "global" ? "global" :
    process.env["FULCRUM_CODEX_SKILLS_SCOPE"] === "project" ? "project" :
    "skip"
  );
  const targets: SkillTarget[] = [];
  let skippedCodex = false;

  for (const agent of AGENTS) {
    if (agent.id === "claude-code" || agent.id === "gemini") continue;
    if (!selectedAgent(opts, agent.id)) continue;
    if (agent.id === "codex") {
      if (codexScope === "skip") {
        skippedCodex = true;
        continue;
      }
      if (codexScope === "project") {
        const projectDir = resolve(opts.projectDir ?? process.cwd());
        targets.push({
          path: join(projectDir, ".codex", "skills"),
          label: `${agent.label} project`,
          projectLocal: true,
        });
        continue;
      }
    }
    targets.push({ path: agent.skillsDir(home), label: agent.label });
  }

  return { targets, skippedCodex };
}

export async function syncSkills(opts: SyncSkillsOptions = {}): Promise<void> {
  const root = repoRoot();
  const skillsSrc = `${root}/skills`;
  if (!(await isDir(skillsSrc))) {
    console.error(`fulcrum skills sync: ${skillsSrc} not found. Set FULCRUM_REPO_DIR to your clone path.`);
    process.exit(1);
  }

  const skills = await authoredSkillNames(skillsSrc);

  if (skills.length === 0) {
    console.log("fulcrum skills sync: no skills authored yet");
    return;
  }

  console.log(`fulcrum skills sync — ${skills.length} skill(s): ${skills.join(", ")}\n`);

  // Claude Code: install via plugin marketplace. Claude's loader only sees
  // top-level skills under ~/.claude/skills/<name>/SKILL.md; the
  // <dir>/fulcrum/<name>/ layout used by other agents is invisible there.
  // Read HOME at call time (not module load) so test harnesses can override it.
  const home = process.env["HOME"] ?? "";
  const claudeAgent = AGENTS.find((a) => a.id === "claude-code")!;
  const claudeRoot = claudeAgent.baseDir(home);
  if (selectedAgent(opts, "claude-code") && await isDir(claudeRoot)) {
    console.log(`→ Claude Code (plugin: ${PLUGIN_SPEC} from ${PLUGIN_MARKETPLACE})`);
    await installClaudePlugin(root, { dryRun: opts.dryRun ?? false });
    await cleanupLegacyClaudeSkills({ dryRun: opts.dryRun ?? false });
    console.log();
  } else if (selectedAgent(opts, "claude-code")) {
    console.log("· skip Claude Code (~/.claude not present)");
  }

  const { targets, skippedCodex } = skillTargets(home, opts);
  if (skippedCodex) {
    console.log("· skip Codex CLI global skills (use --codex-scope global or --codex-project <dir> to opt in)");
  }
  for (const t of targets) {
    if (!t.projectLocal && !(await isDir(dirname(t.path))) && !(await isDir(t.path))) {
      console.log(`· skip ${t.label} (parent dir not present)`);
      continue;
    }
    const nsPath = `${t.path}/${NAMESPACE}`;
    console.log(`→ ${t.label} (${nsPath})`);
    await syncSkillSet(skills, skillsSrc, nsPath, opts, `${NAMESPACE}/`);
    console.log();
  }

  // Gemini uses an extension namespace: ~/.gemini/extensions/fulcrum-skills/skills/
  // skillsDir already points to the `skills` subfolder inside that extension.
  const geminiAgent = AGENTS.find((a) => a.id === "gemini")!;
  const gemRoot = geminiAgent.baseDir(home);
  if (selectedAgent(opts, "gemini") && await exists(gemRoot)) {
    // ext = ~/.gemini/extensions/fulcrum-skills  (parent of skillsDir)
    const gemSkillsDir = geminiAgent.skillsDir(home);
    const ext = gemSkillsDir.replace(/\/skills$/, "");
    console.log(`→ Gemini CLI (${ext})`);
    if (opts.dryRun) {
      console.log(`    [dry-run] would write: ${ext}/gemini-extension.json`);
    } else {
      await mkdir(ext, { recursive: true });
      await writeFile(
        `${ext}/gemini-extension.json`,
        JSON.stringify(
          { name: "fulcrum-skills", version: "0.1.0", description: "Fulcrum-authored skills for Gemini CLI." },
          null,
          2,
        ) + "\n",
      );
    }
    await syncSkillSet(skills, skillsSrc, gemSkillsDir, opts);
  } else if (selectedAgent(opts, "gemini")) {
    console.log("· skip Gemini (~/.gemini not present)");
  }
  console.log("Done.");
}

async function cmdSync(args: string[]): Promise<void> {
  let dryRun = false;
  let codexScope: CodexSkillScope | undefined;
  let projectDir: string | undefined;
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
      i += 1;
    } else if (arg === "--codex-scope") {
      const value = args[i + 1];
      if (value !== "skip" && value !== "global" && value !== "project") {
        console.error("fulcrum skills sync: --codex-scope must be skip, global, or project");
        process.exit(2);
      }
      codexScope = value;
      i += 2;
    } else if (arg === "--codex-global") {
      codexScope = "global";
      i += 1;
    } else if (arg === "--codex-project") {
      codexScope = "project";
      projectDir = args[i + 1] ?? process.cwd();
      i += 2;
    } else if (arg === "--project-dir") {
      projectDir = args[i + 1] ?? process.cwd();
      i += 2;
    } else {
      console.error(`fulcrum skills sync: unknown arg '${arg}'`);
      process.exit(2);
    }
  }
  return syncSkills({ dryRun, codexScope, projectDir });
}

// ── lint ───────────────────────────────────────────────────────────────

interface LintIssue { msg: string }
interface LintResult { file: string; ok: boolean; issues: LintIssue[]; name?: string; descLen?: number }

function parseFrontmatter(text: string): Record<string, string> | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const body = m[1] ?? "";
  const out: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!km) continue;
    let v = (km[2] ?? "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[km[1]!] = v;
  }
  return out;
}

// Required H2 section headings, in order. Mirrors skills/_template/SKILL.md.
const REQUIRED_SECTIONS = ["When to use", "Invocation", "Patterns", "Anti-patterns", "Cross-refs"];

async function lintOne(file: string): Promise<LintResult> {
  const issues: LintIssue[] = [];
  const dir = basename(dirname(file));

  if (!(await exists(file))) {
    return { file, ok: false, issues: [{ msg: "not a file" }] };
  }
  const text = await readFile(file, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) return { file, ok: false, issues: [{ msg: "missing YAML frontmatter" }] };

  const name = fm["name"];
  const desc = fm["description"];

  if (!name) issues.push({ msg: "missing 'name' in frontmatter" });
  else {
    if (!/^[a-z0-9-]+$/.test(name)) issues.push({ msg: `name '${name}' must be lowercase + digits + hyphens` });
    if (name.length > 64) issues.push({ msg: `name length ${name.length} exceeds 64` });
    if (/(anthropic|claude)/i.test(name)) issues.push({ msg: `name '${name}' contains reserved word` });
    if (name !== dir) issues.push({ msg: `name '${name}' must equal directory '${dir}'` });
  }

  if (!desc) issues.push({ msg: "missing 'description' in frontmatter" });
  else {
    if (desc.length > 1024) issues.push({ msg: `description length ${desc.length} exceeds 1024` });
    if (/<[a-zA-Z/]/.test(desc)) issues.push({ msg: "description contains XML-like tags" });
  }

  // Body section structure. Headings at H2 only (skip H1 title and H3 sub-sections).
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
  const headings: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m && m[1]) headings.push(m[1]);
  }
  let cursor = 0;
  for (const required of REQUIRED_SECTIONS) {
    const idx = headings.indexOf(required, cursor);
    if (idx < 0) {
      issues.push({ msg: `missing or out-of-order H2 section '## ${required}' (expected after position ${cursor})` });
      break;
    }
    cursor = idx + 1;
  }

  return { file, ok: issues.length === 0, issues, name: name ?? "", descLen: desc?.length ?? 0 };
}

async function cmdLint(target: string | undefined): Promise<void> {
  if (!target) {
    console.error("usage: fulcrum skills lint <SKILL.md | skills/dir>");
    process.exit(2);
  }
  const files: string[] = [];
  let checkRules = false;

  if (await isDir(target)) {
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "_template") continue;
      // _archive/ holds deprecated skills — skip in lint.
      if (entry.name === "_archive") continue;
      const p = `${target}/${entry.name}/SKILL.md`;
      if (await exists(p)) files.push(p);
    }
    // When linting a directory (skills/ or <path>/skills), also check rules/AGENTS.md
    const normalized = target.replace(/\/$/, "");
    if (normalized === "skills" || normalized.endsWith("/skills")) {
      checkRules = true;
    }
  } else if (await exists(target)) {
    files.push(target);
  } else {
    console.error(`fulcrum skills lint: no such file or directory: ${target}`);
    process.exit(2);
  }

  let bad = 0;
  for (const f of files) {
    const r = await lintOne(f);
    if (r.ok) console.log(`✓ ${r.file}  (name=${r.name}, desc=${r.descLen}c)`);
    else {
      bad++;
      console.log(`✗ ${r.file}`);
      for (const i of r.issues) console.log(`    - ${i.msg}`);
    }
  }

  // Check rules/AGENTS.md line count when linting the skills directory
  if (checkRules) {
    const root = repoRoot();
    const rulesPath = `${root}/rules/AGENTS.md`;
    if (await exists(rulesPath)) {
      const content = await readFile(rulesPath, "utf8");
      const lineCount = content.split("\n").length;
      const limit = 200;
      if (lineCount > limit) {
        bad++;
        console.log(`✗ ${rulesPath}  (${lineCount} lines, exceeds 200-line target)`);
      } else {
        console.log(`✓ ${rulesPath}  (${lineCount} lines, under 200-line target)`);
      }
    }
  }

  if (bad > 0) process.exit(1);
}

// ── list ───────────────────────────────────────────────────────────────

async function cmdList(args: string[] = []): Promise<void> {
  let installed = false;
  for (const arg of args) {
    if (arg === "--installed") installed = true;
    else {
      console.error(`fulcrum skills list: unknown arg '${arg}'`);
      process.exit(2);
    }
  }

  if (installed) {
    const { scanSkillBudgets } = await import("./skill-budget.ts");
    const home = process.env["HOME"] ?? "";
    const budget = await scanSkillBudgets(home);
    console.log("Installed skill metadata budget:\n");
    for (const agent of budget.agents) {
      if (agent.activeSkillCount === 0) continue;
      const marker = agent.overThreshold ? "warning" : "ok";
      console.log(`${agent.label}: ${agent.activeSkillCount} skills, ${agent.totalDescriptionChars}/${agent.warningThresholdChars} description chars (${marker})`);
      for (const root of agent.sourceRoots) {
        console.log(`  ${root.path}  ${root.skills} skills  ${root.descriptionChars} chars`);
      }
      if (agent.duplicateNames.length > 0) {
        console.log(`  duplicates: ${agent.duplicateNames.map((dup) => `${dup.name}×${dup.count}`).join(", ")}`);
      }
    }
    return;
  }

  const root = repoRoot();
  const skillsSrc = `${root}/skills`;
  const evalsSrc = `${root}/evals`;
  if (!(await isDir(skillsSrc))) {
    console.error(`fulcrum skills list: ${skillsSrc} not found.`);
    process.exit(1);
  }

  const rows: Array<{ name: string; descLen: number; descPreview: string; evalEntries: number | null }> = [];
  for (const entry of await readdir(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "_template" || entry.name === "_archive") continue;
    const skillPath = `${skillsSrc}/${entry.name}/SKILL.md`;
    if (!(await exists(skillPath))) continue;
    const text = await readFile(skillPath, "utf8");
    const fm = parseFrontmatter(text) ?? {};
    const desc = fm["description"] ?? "";
    const descPreview = desc.replace(/\s+/g, " ").slice(0, 80);

    let evalEntries: number | null = null;
    const evalPath = `${evalsSrc}/${entry.name}.json`;
    if (await exists(evalPath)) {
      try {
        const arr = JSON.parse(await readFile(evalPath, "utf8")) as unknown[];
        if (Array.isArray(arr)) evalEntries = arr.length;
      } catch { /* malformed; report 0 */ evalEntries = 0; }
    }
    rows.push({ name: entry.name, descLen: desc.length, descPreview, evalEntries });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));
  console.log(`${rows.length} authored skills in ${skillsSrc}:\n`);
  for (const r of rows) {
    const evalCol = r.evalEntries === null ? "no eval" : `${r.evalEntries} eval entries`;
    console.log(`  ${r.name.padEnd(nameWidth)}  ${evalCol.padEnd(16)}  ${r.descPreview}…`);
  }
}

export async function run(args: string[]): Promise<void> {
  const sub = args[0] ?? "sync";
  switch (sub) {
    case "sync":  return cmdSync(args.slice(1));
    case "lint":  return cmdLint(args[1]);
    case "list":  return cmdList(args.slice(1));
    case "upstream": {
      let dryRun = false;
      let updatePins = false;
      for (const arg of args.slice(1)) {
        if (arg === "--dry-run") dryRun = true;
        else if (arg === "--update-pins") updatePins = true;
        else {
          console.error(`fulcrum skills upstream: unknown arg '${arg}'`);
          process.exit(2);
        }
      }
      const { syncUpstreamSkills } = await import("./upstream-skills.ts");
      return syncUpstreamSkills({ dryRun, updatePins });
    }
    default:
      console.error(`fulcrum skills: unknown subcommand '${sub}'`);
      process.exit(2);
  }
}
