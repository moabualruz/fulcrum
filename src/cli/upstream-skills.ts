// Curated third-party skill sync.
//
// Loads pinned upstream skill metadata from skills/upstream.lock and installs
// the listed SKILL.md folders under a separate managed namespace so authored
// Fulcrum skills (`fulcrum/`) do not mix with vendored packs.

import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { AGENTS } from "../agents/registry.ts";
import { run as runProc } from "../utils/proc.ts";

const UPSTREAM_NAMESPACE = "fulcrum-upstream";
const AUTHOR_CLASSES = new Set(["tool-vendor", "foundation", "individual"] as const);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TREE_SHA = /^[0-9a-f]{40}$/i;

export interface UpstreamSkillLockEntry {
  source: string;
  subpath: string;
  ref: string;
  tree_sha: string;
  license: string;
  author_class: "tool-vendor" | "foundation" | "individual";
  pinned_on: string;
  review_due: string;
}

export interface UpstreamSkill extends UpstreamSkillLockEntry {
  name: string;
  kind: "dir" | "file";
}

interface UpstreamLockDoc {
  meta?: {
    schema_version?: number;
    last_audit?: string;
  };
  skills?: Record<string, unknown>;
}

function homeDir(): string {
  return process.env["HOME"] ?? "";
}

function repoRoot(): string {
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? `${homeDir()}/.fulcrum`;
}

export function upstreamLockPath(root = repoRoot()): string {
  return `${root}/skills/upstream.lock`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function repoCacheDir(repo: string): string {
  const slug = repo.replace(/^https:\/\/github\.com\//, "").replace(/[^A-Za-z0-9._-]+/g, "__");
  return `${fulcrumHome()}/cache/upstream-skills/${slug}`;
}

function inferKind(subpath: string): "dir" | "file" {
  return subpath.toLowerCase().endsWith(".md") ? "file" : "dir";
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function validateDate(value: string, field: string, problems: string[]): void {
  if (!ISO_DATE.test(value)) problems.push(`${field} must be ISO date YYYY-MM-DD`);
}

function validateTreeSha(value: string, problems: string[]): void {
  if (!TREE_SHA.test(value)) problems.push("tree_sha must be a 40-character hex SHA");
}

function normalizeEntry(name: string, raw: unknown): { skill?: UpstreamSkill; problems: string[] } {
  const problems: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { problems: [`${name}: entry must be a TOML table`] };
  }
  const entry = raw as Record<string, unknown>;
  const source = asString(entry["source"]);
  const subpath = asString(entry["subpath"]);
  const ref = asString(entry["ref"]);
  const treeSha = asString(entry["tree_sha"]);
  const license = asString(entry["license"]);
  const authorClass = asString(entry["author_class"]);
  const pinnedOn = asString(entry["pinned_on"]);
  const reviewDue = asString(entry["review_due"]);
  const kind = asString(entry["kind"]);

  if (!source) problems.push("source is required");
  if (!subpath) problems.push("subpath is required");
  if (!ref) problems.push("ref is required");
  if (!treeSha) problems.push("tree_sha is required");
  if (!license) problems.push("license is required");
  if (!authorClass) problems.push("author_class is required");
  if (!pinnedOn) problems.push("pinned_on is required");
  if (!reviewDue) problems.push("review_due is required");

  if (treeSha) validateTreeSha(treeSha, problems);
  if (pinnedOn) validateDate(pinnedOn, "pinned_on", problems);
  if (reviewDue) validateDate(reviewDue, "review_due", problems);
  if (authorClass && !AUTHOR_CLASSES.has(authorClass as UpstreamSkillLockEntry["author_class"])) {
    problems.push(`author_class must be one of: ${Array.from(AUTHOR_CLASSES).join(", ")}`);
  }

  const resolvedKind = kind ? (kind === "file" || kind === "dir" ? kind : null) : subpath ? inferKind(subpath) : null;
  if (kind && !resolvedKind) problems.push("kind must be dir or file");

  if (!source || !subpath || !ref || !treeSha || !license || !authorClass || !pinnedOn || !reviewDue || !resolvedKind) {
    return { problems };
  }

  return {
    skill: {
      name,
      source,
      subpath,
      ref,
      tree_sha: treeSha,
      license,
      author_class: authorClass as UpstreamSkillLockEntry["author_class"],
      pinned_on: pinnedOn,
      review_due: reviewDue,
      kind: resolvedKind,
    },
    problems,
  };
}

export async function loadUpstreamSkills(lockPath = upstreamLockPath()): Promise<readonly UpstreamSkill[]> {
  const raw = await readFile(lockPath, "utf8");
  let parsed: unknown;
  try {
    parsed = parseToml(raw);
  } catch (err) {
    throw new Error(`upstream skills lock is invalid TOML (${lockPath}): ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`upstream skills lock did not parse to a document: ${lockPath}`);
  }

  const doc = parsed as UpstreamLockDoc;
  const schemaVersion = doc.meta?.schema_version;
  if (schemaVersion !== 1) {
    throw new Error(`upstream skills lock schema_version must be 1 (${lockPath})`);
  }

  const skillsTable = doc.skills;
  if (!skillsTable || typeof skillsTable !== "object" || Array.isArray(skillsTable)) {
    throw new Error(`upstream skills lock is missing [skills.<name>] entries: ${lockPath}`);
  }

  const problems: string[] = [];
  const skills: UpstreamSkill[] = [];
  for (const [name, rawEntry] of Object.entries(skillsTable)) {
    const normalized = normalizeEntry(name, rawEntry);
    if (normalized.skill) skills.push(normalized.skill);
    for (const problem of normalized.problems) problems.push(`${name}: ${problem}`);
  }

  if (problems.length > 0) {
    throw new Error(`upstream skills lock is missing required metadata:\n- ${problems.join("\n- ")}`);
  }
  if (skills.length === 0) {
    throw new Error(`upstream skills lock has no curated entries: ${lockPath}`);
  }

  return skills;
}

async function copyTree(src: string, dst: string, dryRun: boolean): Promise<void> {
  if (dryRun) console.log(`      [dry-run] would mkdir: ${dst}`);
  else await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) await copyTree(s, d, dryRun);
    else if (entry.isFile()) {
      if (dryRun) console.log(`      [dry-run] would copy: ${s} → ${d}`);
      else await copyFile(s, d);
    }
  }
}

async function copySkill(src: string, dst: string, kind: "dir" | "file", dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    console.log(`      [dry-run] would install ${kind}: ${src} → ${dst}`);
    return true;
  }

  if (kind === "file") {
    if (!(await exists(src))) return false;
    await mkdir(dst, { recursive: true });
    await copyFile(src, `${dst}/SKILL.md`);
    return true;
  }

  if (!(await isDir(src)) || !(await exists(`${src}/SKILL.md`))) return false;
  await copyTree(src, dst, dryRun);
  return true;
}

async function ensureRepo(repo: string, ref: string, sha: string, dryRun: boolean): Promise<string | null> {
  const dir = repoCacheDir(repo);
  if (dryRun) {
    console.log(`  [dry-run] would clone/update ${repo} → ${dir}`);
    console.log(`  [dry-run] would checkout ${sha} (${ref})`);
    return dir;
  }
  if (await exists(`${dir}/.git`)) {
    const fetch = await runProc(["git", "-C", dir, "fetch", "--depth=1", "origin", ref]);
    if (fetch.exit !== 0) {
      console.log(`  ✗ ${repo} fetch failed (${ref}): ${fetch.stderr.trim()}`);
      return null;
    }
  } else {
    await mkdir(dirname(dir), { recursive: true });
    const clone = await runProc(["git", "clone", "--depth=1", "--branch", ref, repo, dir]);
    if (clone.exit !== 0) {
      console.log(`  ✗ ${repo} clone failed (${ref}): ${clone.stderr.trim()}`);
      return null;
    }
  }
  const checkout = await runProc(["git", "-C", dir, "checkout", "--detach", sha]);
  if (checkout.exit !== 0) {
    console.log(`  ✗ ${repo} checkout failed (${sha} from ${ref}): ${checkout.stderr.trim()}`);
    return null;
  }
  return dir;
}

function agentTargets(home: string): Array<{ label: string; baseRoot: string; skillsRoot: string; extensionRoot?: string }> {
  const out: Array<{ label: string; baseRoot: string; skillsRoot: string; extensionRoot?: string }> = [];
  for (const agent of AGENTS) {
    if (agent.id === "gemini") {
      const extensionRoot = `${agent.baseDir(home)}/extensions/${UPSTREAM_NAMESPACE}-skills`;
      out.push({ label: agent.label, baseRoot: agent.baseDir(home), skillsRoot: `${extensionRoot}/skills`, extensionRoot });
    } else {
      out.push({ label: agent.label, baseRoot: agent.skillsDir(home), skillsRoot: `${agent.skillsDir(home)}/${UPSTREAM_NAMESPACE}` });
    }
  }
  return out;
}

export async function syncUpstreamSkills(opts: { dryRun?: boolean; skills?: readonly UpstreamSkill[]; lockPath?: string } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const lockPath = opts.lockPath ?? upstreamLockPath();
  const skills = opts.skills ?? await loadUpstreamSkills(lockPath);
  const home = homeDir();

  console.log(`fulcrum upstream skills sync — ${skills.length} curated skill(s)\n`);

  const repos = Array.from(new Map(skills.map((s) => [s.source, s])).values());
  const repoDirs = new Map<string, string>();
  for (const skill of repos) {
    const dir = await ensureRepo(skill.source, skill.ref, skill.tree_sha, dryRun);
    if (dir) repoDirs.set(skill.source, dir);
  }
  console.log();

  for (const target of agentTargets(home)) {
    if (!target.extensionRoot && !(await isDir(target.baseRoot))) {
      console.log(`· skip ${target.label} (agent skills parent not present)`);
      continue;
    }
    console.log(`→ ${target.label} (${target.skillsRoot})`);
    if (target.extensionRoot) {
      if (await isDir(target.baseRoot)) {
        if (dryRun) {
          console.log(`    [dry-run] would write: ${target.extensionRoot}/gemini-extension.json`);
        } else {
          await mkdir(target.skillsRoot, { recursive: true });
          await writeFile(
            `${target.extensionRoot}/gemini-extension.json`,
            JSON.stringify({ name: `${UPSTREAM_NAMESPACE}-skills`, version: "0.1.0", description: "Curated upstream skills managed by Fulcrum." }, null, 2) + "\n",
          );
        }
      } else {
        console.log("    · skip Gemini (~/.gemini not present)");
        continue;
      }
    }
    for (const skill of skills) {
      const repoDir = repoDirs.get(skill.source);
      if (!repoDir) continue;
      const src = `${repoDir}/${skill.subpath}`;
      const ok = await copySkill(src, `${target.skillsRoot}/${skill.name}`, skill.kind, dryRun);
      if (ok) console.log(`    ${UPSTREAM_NAMESPACE}/${skill.name}`);
      else console.log(`    · missing upstream path: ${skill.source}:${skill.subpath}`);
    }
    console.log();
  }
  console.log("Done.");
}
