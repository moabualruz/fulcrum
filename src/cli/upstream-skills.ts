// Curated third-party skill sync.
//
// Loads pinned upstream skill metadata from skills/upstream.lock and installs
// the listed SKILL.md folders under a separate managed namespace so authored
// Fulcrum skills (`fulcrum/`) do not mix with vendored packs.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parse as parseToml } from "smol-toml";
import { AGENTS } from "../agents/registry.ts";
import { run as runProc, which } from "../utils/proc.ts";

const UPSTREAM_NAMESPACE = "fulcrum-upstream";
const AUTHOR_CLASSES = new Set(["tool-vendor", "foundation", "individual"] as const);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TREE_SHA = /^[0-9a-f]{40}$/i;

/**
 * Optional Claude plugin descriptor for skills that have an official Claude
 * plugin marketplace entry (W1.6).  When present, Claude Code uses
 * `claude plugin marketplace add <marketplace>` + `claude plugin install <name>`
 * instead of the file-copy path.  Other agents always use the file-copy path.
 */
export interface ClaudePluginDescriptor {
  /** Marketplace identifier, e.g. "ast-grep/agent-skill". */
  marketplace: string;
  /** Plugin name passed to `claude plugin install`, e.g. "ast-grep@ast-grep/agent-skill". */
  name: string;
}

export interface UpstreamSkillLockEntry {
  source: string;
  subpath: string;
  ref: string;
  tree_sha: string;
  license: string;
  author_class: "tool-vendor" | "foundation" | "individual";
  pinned_on: string;
  review_due: string;
  /** SHA-256 of the canonicalized skill subtree (see computeSubpathSha256). */
  subpath_sha256?: string;
  /** Total byte-size of files included in the subtree hash (sanity check). */
  subpath_size?: number;
  /**
   * Optional: when set, Claude Code installs via `claude plugin` instead of
   * file copy.  Other agents always use the file-copy path.  Additive optional;
   * entries without this field behave identically to before W1.6.
   */
  claude_plugin?: ClaudePluginDescriptor;
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
  const subpathSha256 = asString(entry["subpath_sha256"]);
  const subpathSizeRaw = entry["subpath_size"];
  const subpathSize = typeof subpathSizeRaw === "number" ? subpathSizeRaw : undefined;

  // Parse optional claude_plugin table (W1.6).
  let claudePlugin: ClaudePluginDescriptor | undefined;
  const rawClaudePlugin = entry["claude_plugin"];
  if (rawClaudePlugin && typeof rawClaudePlugin === "object" && !Array.isArray(rawClaudePlugin)) {
    const cp = rawClaudePlugin as Record<string, unknown>;
    const cpMarketplace = asString(cp["marketplace"]);
    const cpName = asString(cp["name"]);
    if (cpMarketplace && cpName) {
      claudePlugin = { marketplace: cpMarketplace, name: cpName };
    }
  }

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
      ...(subpathSha256 ? { subpath_sha256: subpathSha256 } : {}),
      ...(subpathSize !== undefined ? { subpath_size: subpathSize } : {}),
      ...(claudePlugin ? { claude_plugin: claudePlugin } : {}),
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

// ---------------------------------------------------------------------------
// Subpath integrity
// ---------------------------------------------------------------------------

// Walk `dir` and collect all regular files in lexicographic path order.
async function collectFiles(dir: string, base: string, out: Array<{ rel: string; abs: string }>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "POSIX"));
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const abs = join(dir, entry.name);
    const rel = relative(base, abs);
    if (entry.isDirectory()) {
      await collectFiles(abs, base, out);
    } else if (entry.isFile()) {
      out.push({ rel, abs });
    }
  }
}

/**
 * Compute a SHA-256 over the canonicalized skill subtree.
 *
 * Algorithm (deterministic across darwin/linux):
 *   For each file in lexicographic relative-path order:
 *     1. Feed NUL-terminated UTF-8 relative path.
 *     2. Feed big-endian uint64 of file byte-length.
 *     3. Feed raw file bytes.
 *
 * For a single-file skill (kind === "file"), skillPath points directly to the
 * .md file.  Only that file is included, using its basename as the relative path.
 *
 * Returns { sha256: hex, size: total-bytes }.
 */
export async function computeSubpathSha256(
  skillPath: string,
  kind: "dir" | "file",
): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  let totalSize = 0;

  if (kind === "file") {
    const basename = skillPath.split("/").pop() ?? "SKILL.md";
    const bytes = await readFile(skillPath);
    const lenBuf = Buffer.allocUnsafe(8);
    lenBuf.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(basename + "\0");
    hash.update(lenBuf);
    hash.update(bytes);
    totalSize += bytes.length;
  } else {
    const files: Array<{ rel: string; abs: string }> = [];
    await collectFiles(skillPath, skillPath, files);
    for (const { rel, abs } of files) {
      const bytes = await readFile(abs);
      const lenBuf = Buffer.allocUnsafe(8);
      lenBuf.writeBigUInt64BE(BigInt(bytes.length));
      hash.update(rel + "\0");
      hash.update(lenBuf);
      hash.update(bytes);
      totalSize += bytes.length;
    }
  }

  return { sha256: hash.digest("hex"), size: totalSize };
}

/**
 * Serialize the skills table back to TOML, preserving header comments.
 * We write the lockfile by direct string construction — smol-toml has no
 * serializer.  The format mirrors what was already in the file.
 */
async function writeLockfileWithPins(
  lockPath: string,
  _skills: readonly UpstreamSkill[],
  pins: Map<string, { sha256: string; size: number }>,
): Promise<void> {
  const raw = await readFile(lockPath, "utf8");
  const lines = raw.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    // Detect a top-level skill header like [skills.foo-bar]
    // but NOT a sub-table header like [skills.foo-bar.claude_plugin]
    const headerMatch = line.match(/^\[skills\.([^\]\.]+)\]$/);
    if (headerMatch) {
      const skillName = headerMatch[1] ?? "";
      const isNewPin = pins.has(skillName);

      // Collect the block lines (until next top-level [ header or EOF).
      // Only strip old pin lines when we have a new pin to write.
      const blockLines: string[] = [line];
      i++;
      while (i < lines.length) {
        const bl = lines[i] ?? "";
        // Stop at any new top-level [skills.*] header (not sub-table headers).
        if (bl.match(/^\[/) && !bl.match(/^\[skills\.[^\]\.]+\.[^\]]+\]/)) break;
        // Only strip existing subpath_sha256/subpath_size when we have a new pin.
        if (isNewPin && (bl.match(/^subpath_sha256\s*=/) || bl.match(/^subpath_size\s*=/))) {
          i++;
          continue;
        }
        blockLines.push(bl);
        i++;
      }
      // Trim trailing blank lines from block.
      while (blockLines.length > 1 && (blockLines[blockLines.length - 1] ?? "").trim() === "") {
        blockLines.pop();
      }
      // Append new pin fields if we have them.
      const pin = pins.get(skillName);
      if (pin) {
        blockLines.push(`subpath_sha256 = "${pin.sha256}"`);
        blockLines.push(`subpath_size = ${pin.size}`);
      }
      blockLines.push("");
      result.push(...blockLines);
      continue;
    }
    result.push(line);
    i++;
  }

  // Ensure single trailing newline.
  while (result.length > 0 && (result[result.length - 1] ?? "").trim() === "") result.pop();
  result.push("");

  await writeFile(lockPath, result.join("\n"), "utf8");
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

export async function syncUpstreamSkills(
  opts: {
    dryRun?: boolean;
    updatePins?: boolean;
    skills?: readonly UpstreamSkill[];
    lockPath?: string;
  } = {},
): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const updatePins = opts.updatePins ?? false;
  const lockPath = opts.lockPath ?? upstreamLockPath();
  const skills = opts.skills ?? (await loadUpstreamSkills(lockPath));
  const home = homeDir();

  console.log(`fulcrum upstream skills sync — ${skills.length} curated skill(s)\n`);

  const repos = Array.from(new Map(skills.map((s) => [s.source, s])).values());
  const repoDirs = new Map<string, string>();
  for (const skill of repos) {
    const dir = await ensureRepo(skill.source, skill.ref, skill.tree_sha, dryRun);
    if (dir) repoDirs.set(skill.source, dir);
  }
  console.log();

  // Phase 1: verify (or compute) subpath integrity for each skill.
  // We do this before any file copies so a tampered skill fails fast.
  let integrityFailed = false;
  const newPins = new Map<string, { sha256: string; size: number }>();

  if (!dryRun) {
    for (const skill of skills) {
      const repoDir = repoDirs.get(skill.source);
      if (!repoDir) continue;
      const src = `${repoDir}/${skill.subpath}`;
      const srcExists = skill.kind === "file" ? await exists(src) : await isDir(src);
      if (!srcExists) continue;

      let computed: { sha256: string; size: number };
      try {
        computed = await computeSubpathSha256(src, skill.kind);
      } catch {
        console.log(`  ✗ ${skill.name} subpath hash computation failed — skip`);
        integrityFailed = true;
        continue;
      }

      if (skill.subpath_sha256) {
        if (computed.sha256 !== skill.subpath_sha256) {
          console.log(
            `  ✗ ${skill.name} subpath integrity FAILED — expected ${skill.subpath_sha256}, got ${computed.sha256}`,
          );
          integrityFailed = true;
        } else {
          console.log(`  ✓ ${skill.name} subpath integrity ok`);
        }
      } else if (updatePins) {
        console.log(`  · ${skill.name} subpath_sha256 not pinned — computing`);
        newPins.set(skill.name, computed);
      } else {
        console.log(`  · ${skill.name} subpath_sha256 not pinned — run with --update-pins to record`);
      }
    }
    console.log();
  }

  if (integrityFailed) {
    console.error("Upstream skill subpath integrity check failed. Aborting install.");
    process.exit(1);
  }

  // Phase 2: write updated pins back to lockfile if requested.
  if (!dryRun && newPins.size > 0) {
    await writeLockfileWithPins(lockPath, skills, newPins);
    console.log(`  Wrote ${newPins.size} new subpath pin(s) to ${lockPath}\n`);
  }

  // Phase 3: copy skills to each agent target.
  // W1.6: for Claude Code, skills with `claude_plugin` set use
  // `claude plugin marketplace add` + `claude plugin install` instead of copy.
  const claudeAvailable = !dryRun ? !!(await which("claude")) : false;

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
            JSON.stringify(
              { name: `${UPSTREAM_NAMESPACE}-skills`, version: "0.1.0", description: "Curated upstream skills managed by Fulcrum." },
              null,
              2,
            ) + "\n",
          );
        }
      } else {
        console.log("    · skip Gemini (~/.gemini not present)");
        continue;
      }
    }

    const isClaudeAgent = target.label === "Claude Code";

    for (const skill of skills) {
      const repoDir = repoDirs.get(skill.source);
      if (!repoDir) continue;

      // W1.6: Claude Code with claude_plugin field — use plugin install path.
      if (isClaudeAgent && skill.claude_plugin) {
        if (dryRun) {
          console.log(`    [dry-run] would run: claude plugin marketplace add ${skill.claude_plugin.marketplace}`);
          console.log(`    [dry-run] would run: claude plugin install ${skill.claude_plugin.name}`);
          console.log(`    ${UPSTREAM_NAMESPACE}/${skill.name} (via claude plugin)`);
          continue;
        }
        if (!claudeAvailable) {
          console.log(`    · ${skill.name}: claude not on PATH — skipping plugin install (manual: claude plugin marketplace add ${skill.claude_plugin.marketplace} && claude plugin install ${skill.claude_plugin.name})`);
          continue;
        }
        // Check idempotency: if plugin cache dir exists, skip.
        const pluginCacheDir = `${home}/.claude/plugins/cache/${skill.claude_plugin.marketplace.replace(/\//g, "__")}`;
        if (await isDir(pluginCacheDir)) {
          console.log(`    · ${skill.name}: already installed via claude plugin (skip)`);
          continue;
        }
        const r1 = await runProc(["claude", "plugin", "marketplace", "add", skill.claude_plugin.marketplace]);
        if (r1.exit !== 0) {
          console.log(`    ✗ ${skill.name}: claude plugin marketplace add failed: ${r1.stderr.trim()}`);
          // Fallback to file copy.
          const src = `${repoDir}/${skill.subpath}`;
          const ok = await copySkill(src, `${target.skillsRoot}/${skill.name}`, skill.kind, dryRun);
          if (ok) console.log(`    ${UPSTREAM_NAMESPACE}/${skill.name} (file copy fallback)`);
        } else {
          const r2 = await runProc(["claude", "plugin", "install", skill.claude_plugin.name]);
          if (r2.exit !== 0) {
            console.log(`    ✗ ${skill.name}: claude plugin install failed: ${r2.stderr.trim()}`);
            // Fallback to file copy.
            const src = `${repoDir}/${skill.subpath}`;
            const ok = await copySkill(src, `${target.skillsRoot}/${skill.name}`, skill.kind, dryRun);
            if (ok) console.log(`    ${UPSTREAM_NAMESPACE}/${skill.name} (file copy fallback)`);
          } else {
            console.log(`    ${UPSTREAM_NAMESPACE}/${skill.name} (via claude plugin install)`);
          }
        }
        continue;
      }

      // Default: file copy path (all agents, or Claude Code without claude_plugin).
      const src = `${repoDir}/${skill.subpath}`;
      const ok = await copySkill(src, `${target.skillsRoot}/${skill.name}`, skill.kind, dryRun);
      if (ok) console.log(`    ${UPSTREAM_NAMESPACE}/${skill.name}`);
      else console.log(`    · missing upstream path: ${skill.source}:${skill.subpath}`);
    }
    console.log();
  }
  console.log("Done.");
}
