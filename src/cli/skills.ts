// fulcrum skills sync — fan out skills/<name>/SKILL.md to every agent's path.
// fulcrum skills lint <path> — validate frontmatter (+ body section presence)
// against the strictest union of all 5 agents' rules.
// fulcrum skills list — enumerate authored skills with name, desc preview, eval coverage.
// fulcrum skills upstream — sync curated third-party skills.

import { mkdir, readdir, readFile, copyFile, writeFile, stat } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { AGENTS } from "../agents/registry.ts";

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
// Skills install under a `fulcrum/` subfolder in each agent's skills directory:
//   ~/.claude/skills/fulcrum/<name>/SKILL.md   etc.
// This sets up the `fulcrum:<skill-name>` invocation pattern that aligns with how
// plugin/extension systems namespace third-party content. When we ship plugins
// or extensions later, the path layout already matches the prefixing convention.

const NAMESPACE = "fulcrum";

// Agents that use the standard `<skillsDir>/fulcrum/<name>/` layout.
// Gemini is handled separately below because it uses an extension namespace.
const _skillsHome = process.env["HOME"] ?? "";
const TARGETS: Array<{ path: string; label: string }> = AGENTS
  .filter((a) => a.id !== "gemini")
  .map((a) => ({ path: a.skillsDir(_skillsHome), label: a.label }));

// Skip patterns: .original.md backups are human-edit source-of-truth — agents
// read the compressed .md only. Also skip .git, node_modules just in case.
function shouldSkipForSync(name: string): boolean {
  if (name.endsWith(".original.md")) return true;
  if (name === ".git" || name === "node_modules") return true;
  return false;
}

async function copyTree(src: string, dst: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  if (opts.dryRun) {
    console.log(`    [dry-run] would mkdir: ${dst}`);
  } else {
    await mkdir(dst, { recursive: true });
  }
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (shouldSkipForSync(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(s, d, opts);
    } else {
      if (opts.dryRun) {
        console.log(`    [dry-run] would copy: ${s} → ${d}`);
      } else {
        await copyFile(s, d);
      }
    }
  }
}

export async function syncSkills(opts: { dryRun?: boolean } = {}): Promise<void> {
  const root = repoRoot();
  const skillsSrc = `${root}/skills`;
  if (!(await isDir(skillsSrc))) {
    console.error(`fulcrum skills sync: ${skillsSrc} not found. Set FULCRUM_REPO_DIR to your clone path.`);
    process.exit(1);
  }

  const skills: string[] = [];
  for (const entry of await readdir(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "_template") continue;
    if (await exists(`${skillsSrc}/${entry.name}/SKILL.md`)) {
      skills.push(entry.name);
    }
  }

  if (skills.length === 0) {
    console.log("fulcrum skills sync: no skills authored yet");
    return;
  }

  console.log(`fulcrum skills sync — ${skills.length} skill(s): ${skills.join(", ")}\n`);

  for (const t of TARGETS) {
    if (!(await isDir(dirname(t.path))) && !(await isDir(t.path))) {
      console.log(`· skip ${t.label} (parent dir not present)`);
      continue;
    }
    const nsPath = `${t.path}/${NAMESPACE}`;
    console.log(`→ ${t.label} (${nsPath})`);
    if (opts.dryRun) {
      console.log(`    [dry-run] would mkdir: ${nsPath}`);
    } else {
      await mkdir(nsPath, { recursive: true });
    }
    for (const name of skills) {
      const dst = `${nsPath}/${name}`;
      await copyTree(`${skillsSrc}/${name}`, dst, opts);
      console.log(`    ${NAMESPACE}/${name}`);
    }
    console.log();
  }

  // Gemini uses an extension namespace: ~/.gemini/extensions/fulcrum-skills/skills/
  // skillsDir already points to the `skills` subfolder inside that extension.
  const geminiAgent = AGENTS.find((a) => a.id === "gemini")!;
  const gemRoot = geminiAgent.baseDir(_skillsHome);
  if (await exists(gemRoot)) {
    // ext = ~/.gemini/extensions/fulcrum-skills  (parent of skillsDir)
    const gemSkillsDir = geminiAgent.skillsDir(_skillsHome);
    const ext = gemSkillsDir.replace(/\/skills$/, "");
    console.log(`→ Gemini CLI (${ext})`);
    if (opts.dryRun) {
      console.log(`    [dry-run] would mkdir: ${gemSkillsDir}`);
      console.log(`    [dry-run] would write: ${ext}/gemini-extension.json`);
    } else {
      await mkdir(gemSkillsDir, { recursive: true });
      await writeFile(
        `${ext}/gemini-extension.json`,
        JSON.stringify(
          { name: "fulcrum-skills", version: "0.1.0", description: "Fulcrum-authored skills for Gemini CLI." },
          null,
          2,
        ) + "\n",
      );
    }
    for (const name of skills) {
      const dst = `${gemSkillsDir}/${name}`;
      await copyTree(`${skillsSrc}/${name}`, dst, opts);
      console.log(`    ${name}`);
    }
  } else {
    console.log("· skip Gemini (~/.gemini not present)");
  }
  console.log("Done.");
}

async function cmdSync(args: string[]): Promise<void> {
  let dryRun = false;
  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else {
      console.error(`fulcrum skills sync: unknown arg '${arg}'`);
      process.exit(2);
    }
  }
  return syncSkills({ dryRun });
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

async function cmdList(): Promise<void> {
  const root = repoRoot();
  const skillsSrc = `${root}/skills`;
  const evalsSrc = `${root}/evals`;
  if (!(await isDir(skillsSrc))) {
    console.error(`fulcrum skills list: ${skillsSrc} not found.`);
    process.exit(1);
  }

  const rows: Array<{ name: string; descLen: number; descPreview: string; evalEntries: number | null }> = [];
  for (const entry of await readdir(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "_template") continue;
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
    case "list":  return cmdList();
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
