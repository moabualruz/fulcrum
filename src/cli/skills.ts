// fulcrum skills sync — fan out skills/<name>/SKILL.md to every agent's path.
// fulcrum skills lint <path> — validate frontmatter against the strictest
// union of all 5 agents' rules.

import { mkdir, readdir, readFile, copyFile, writeFile, stat } from "node:fs/promises";
import { join, basename, dirname } from "node:path";

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

const TARGETS: Array<{ path: string; label: string }> = [
  { path: `${process.env["HOME"]}/.claude/skills`,           label: "Claude Code" },
  { path: `${process.env["HOME"]}/.codex/skills`,            label: "Codex CLI" },
  { path: `${process.env["HOME"]}/.config/opencode/skills`,  label: "OpenCode" },
  { path: `${process.env["HOME"]}/.pi/agent/skills`,         label: "Pi CLI" },
];

async function copyTree(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(s, d);
    } else {
      await copyFile(s, d);
    }
  }
}

async function cmdSync(): Promise<void> {
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
    console.log(`→ ${t.label} (${t.path})`);
    await mkdir(t.path, { recursive: true });
    for (const name of skills) {
      const dst = `${t.path}/${name}`;
      await copyTree(`${skillsSrc}/${name}`, dst);
      console.log(`    ${name}`);
    }
    console.log();
  }

  // Gemini wrapping.
  const gemRoot = `${process.env["HOME"]}/.gemini`;
  if (await exists(gemRoot)) {
    const ext = `${gemRoot}/extensions/fulcrum-skills`;
    console.log(`→ Gemini CLI (${ext})`);
    await mkdir(`${ext}/skills`, { recursive: true });
    await writeFile(
      `${ext}/gemini-extension.json`,
      JSON.stringify(
        { name: "fulcrum-skills", version: "0.1.0", description: "Fulcrum-authored skills for Gemini CLI." },
        null,
        2,
      ) + "\n",
    );
    for (const name of skills) {
      const dst = `${ext}/skills/${name}`;
      await copyTree(`${skillsSrc}/${name}`, dst);
      console.log(`    ${name}`);
    }
  } else {
    console.log("· skip Gemini (~/.gemini not present)");
  }
  console.log("Done.");
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

  return { file, ok: issues.length === 0, issues, name: name ?? "", descLen: desc?.length ?? 0 };
}

async function cmdLint(target: string | undefined): Promise<void> {
  if (!target) {
    console.error("usage: fulcrum skills lint <SKILL.md | skills/dir>");
    process.exit(2);
  }
  const files: string[] = [];
  if (await isDir(target)) {
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "_template") continue;
      const p = `${target}/${entry.name}/SKILL.md`;
      if (await exists(p)) files.push(p);
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
  if (bad > 0) process.exit(1);
}

export async function run(args: string[]): Promise<void> {
  const sub = args[0] ?? "sync";
  switch (sub) {
    case "sync":  return cmdSync();
    case "lint":  return cmdLint(args[1]);
    default:
      console.error(`fulcrum skills: unknown subcommand '${sub}'`);
      process.exit(2);
  }
}
