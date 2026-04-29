// Curated third-party skill sync.
//
// Loads pinned upstream skill metadata from skills/upstream.lock and installs
// the listed SKILL.md folders under a separate managed namespace so authored
// Fulcrum skills (`fulcrum/`) do not mix with vendored packs.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseToml } from "smol-toml";
import { AGENTS } from "../agents/registry.ts";
import type { AgentId } from "./mcp-registry.ts";
import { ALL_AGENT_IDS } from "./mcp-registry.ts";
import { run as runProc, which } from "../utils/proc.ts";

const AUTHOR_CLASSES = new Set(["tool-vendor", "foundation", "individual"] as const);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TREE_SHA = /^[0-9a-f]{40}$/i;
const KNOWN_AGENT_IDS = new Set<string>(ALL_AGENT_IDS);
const SAFE_SKILL_DIR_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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
   * Optional: vendor-canonical install via `claude plugin` instead of file copy.
   * Retained for uninstall/audit purposes even after the install path moved to
   * `npx skills add` in init-vendor.ts.
   */
  claude_plugin?: ClaudePluginDescriptor;
  /**
   * Agents whose vendor publishes a per-agent canonical installer (e.g.
   * `graphify install --platform <agent>`). For those agents the upstream
   * sync stays out of the way — vendor's own write into the agent's
   * top-level skills directory is the source of truth. Empty/absent means
   * the file-copy mirror runs for every detected agent into the same
   * top-level `<agent>/skills/<name>/` location the vendor would have used.
   */
  vendor_canonical_agents?: AgentId[];
}

export interface ClaudePluginDescriptor {
  /** Marketplace identifier, e.g. "ast-grep/agent-skill". */
  marketplace: string;
  /** Plugin name passed to `claude plugin install`, e.g. "ast-grep@ast-grep/agent-skill". */
  name: string;
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

function isSafeSkillDirName(value: string): boolean {
  return SAFE_SKILL_DIR_NAME.test(value);
}

function isSafeRelativeSubpath(value: string): boolean {
  if (isAbsolute(value)) return false;
  const normalized = resolve("/", value);
  const rel = relative("/", normalized);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && rel === value.replace(/\\/g, "/");
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

  // Parse optional vendor_canonical_agents array.
  let vendorCanonicalAgents: AgentId[] | undefined;
  const rawVca = entry["vendor_canonical_agents"];
  if (Array.isArray(rawVca)) {
    const ids: AgentId[] = [];
    for (const v of rawVca) {
      const s = asString(v);
      if (!s) { problems.push("vendor_canonical_agents entries must be strings"); continue; }
      if (!KNOWN_AGENT_IDS.has(s)) {
        problems.push(`vendor_canonical_agents value '${s}' must be one of: ${[...KNOWN_AGENT_IDS].join(", ")}`);
        continue;
      }
      ids.push(s as AgentId);
    }
    vendorCanonicalAgents = ids;
  } else if (rawVca !== undefined) {
    problems.push("vendor_canonical_agents must be an array of agent IDs");
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
  if (!isSafeSkillDirName(name)) problems.push("name must be a safe skill directory name");
  if (subpath && !isSafeRelativeSubpath(subpath)) problems.push("subpath must stay inside repo cache");
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
      ...(vendorCanonicalAgents ? { vendor_canonical_agents: vendorCanonicalAgents } : {}),
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

async function readSkillFrontmatterName(src: string, kind: "dir" | "file"): Promise<string | null> {
  const skillFile = kind === "file" ? src : `${src}/SKILL.md`;
  try {
    const raw = await readFile(skillFile, "utf8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    const nameMatch = match[1]?.match(/^name:\s*["']?([^"'\r\n#]+)["']?\s*$/m);
    return nameMatch?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function removeStalePiSkillDir(path: string, name: string, dryRun: boolean): Promise<void> {
  if (!(await isDir(path))) return;
  const marker = upstreamMirrorMarkerPath("pi", name);
  if (dryRun) {
    console.log(`      [dry-run] would remove stale Pi skill dir: ${path}`);
    console.log(`      [dry-run] would remove marker: ${marker}`);
    return;
  }
  if (!(await exists(marker))) {
    console.log(`      · skip stale Pi skill dir (Fulcrum marker not present): ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
  await rm(marker, { force: true });
}

async function removeVendorSkillDir(path: string, agentId: AgentId, name: string, dryRun: boolean): Promise<void> {
  if (!(await isDir(path))) return;
  const marker = upstreamMirrorMarkerPath(agentId, name);
  if (dryRun) {
    console.log(`      [dry-run] would remove: ${path}`);
    console.log(`      [dry-run] would remove marker: ${marker}`);
    return;
  }
  if (!(await exists(marker))) {
    console.log(`      · skip ${name} (Fulcrum marker not present): ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
  await rm(marker, { force: true });
  console.log(`      removed: ${path}`);
}

function upstreamMirrorMarkerPath(agentId: AgentId, name: string): string {
  return `${fulcrumHome()}/state/global/upstream-skills/${agentId}/${name}.installed`;
}

async function writeUpstreamMirrorMarker(agentId: AgentId, name: string, dryRun: boolean): Promise<void> {
  const marker = upstreamMirrorMarkerPath(agentId, name);
  if (dryRun) {
    console.log(`      [dry-run] would write marker: ${marker}`);
    return;
  }
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, new Date().toISOString() + "\n", "utf8");
}

function skillSourcePath(repoDir: string, subpath: string): string | null {
  const root = resolve(repoDir);
  const candidate = resolve(root, subpath);
  const rel = relative(root, candidate);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return candidate;
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

/**
 * Each upstream skill installs into the vendor's own placement convention,
 * NOT into a fulcrum-owned namespace. We don't own third-party skills so we
 * don't rename their paths.
 *
 * For Claude / Codex / OpenCode / Pi: `<agent>/skills/<name>/SKILL.md`.
 * For Gemini: `~/.gemini/skills/<name>/SKILL.md` — the same path
 * `graphify install --platform gemini` uses (Gemini auto-discovers SKILL.md
 * trees from this dir, no extension wrapper needed).
 *
 * Note: this is NOT the same as `agent.skillsDir(home)` for Gemini —
 * our authored skills live under the `extensions/fulcrum-skills/` wrapper
 * because we own that namespace. Third-party skills go where the vendor
 * itself drops them.
 */
function vendorSkillsDir(home: string, agentId: AgentId): string {
  if (agentId === "gemini") return `${home}/.gemini/skills`;
  // For every other agent, our skillsDir already matches the vendor convention.
  for (const agent of AGENTS) if (agent.id === agentId) return agent.skillsDir(home);
  throw new Error(`unknown agent id: ${agentId}`);
}

function agentTargets(home: string): Array<{ id: AgentId; label: string; baseRoot: string; skillsRoot: string }> {
  const out: Array<{ id: AgentId; label: string; baseRoot: string; skillsRoot: string }> = [];
  for (const agent of AGENTS) {
    const skillsRoot = vendorSkillsDir(home, agent.id);
    const baseRoot = agent.rootDir(home);
    out.push({ id: agent.id, label: agent.label, baseRoot, skillsRoot });
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
      const src = skillSourcePath(repoDir, skill.subpath);
      if (!src) {
        console.log(`  ✗ ${skill.name} subpath escapes repo cache — skip`);
        integrityFailed = true;
        continue;
      }
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
    if (!(await isDir(target.baseRoot))) {
      console.log(`· skip ${target.label} (agent skills parent not present)`);
      continue;
    }
    console.log(`→ ${target.label} (${target.skillsRoot})`);

    const isClaudeAgent = target.label === "Claude Code";

    for (const skill of skills) {
      const repoDir = repoDirs.get(skill.source);
      if (!repoDir) continue;

      // Vendor-canonical gate: when the upstream skill ships a per-agent
      // installer (e.g. `graphify install --platform <agent>`), the vendor's
      // canonical placement under <agent>/skills/<name>/ is the source of
      // truth. Stay out for those agents — fulcrum-upstream/<name>/ here
      // would create a duplicate that triggers "Skill conflict detected"
      // warnings at agent startup.
      if (skill.vendor_canonical_agents && skill.vendor_canonical_agents.includes(target.id)) {
        console.log(`    · ${skill.name} (vendor-canonical install handles ${target.label}; skip mirror)`);
        continue;
      }

      // W1.6: Claude Code with claude_plugin field — use plugin install path.
      if (isClaudeAgent && skill.claude_plugin) {
        if (dryRun) {
          console.log(`    [dry-run] would run: claude plugin marketplace add ${skill.claude_plugin.marketplace}`);
          console.log(`    [dry-run] would run: claude plugin install ${skill.claude_plugin.name}`);
          console.log(`    ${skill.name} (via claude plugin)`);
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
          const src = skillSourcePath(repoDir, skill.subpath);
          const dst = safeSkillDirCandidate(target.skillsRoot, skill.name);
          if (!src || !dst) {
            console.log(`    · ${skill.name}: unsafe fallback copy path`);
          } else {
            const ok = await copySkill(src, dst, skill.kind, dryRun);
            if (ok) {
              await writeUpstreamMirrorMarker(target.id, skill.name, dryRun);
              console.log(`    ${skill.name} (file copy fallback)`);
            }
          }
        } else {
          const r2 = await runProc(["claude", "plugin", "install", skill.claude_plugin.name]);
          if (r2.exit !== 0) {
            console.log(`    ✗ ${skill.name}: claude plugin install failed: ${r2.stderr.trim()}`);
            // Fallback to file copy.
            const src = skillSourcePath(repoDir, skill.subpath);
            const dst = safeSkillDirCandidate(target.skillsRoot, skill.name);
            if (!src || !dst) {
              console.log(`    · ${skill.name}: unsafe fallback copy path`);
            } else {
              const ok = await copySkill(src, dst, skill.kind, dryRun);
              if (ok) {
                await writeUpstreamMirrorMarker(target.id, skill.name, dryRun);
                console.log(`    ${skill.name} (file copy fallback)`);
              }
            }
          } else {
            console.log(`    ${skill.name} (via claude plugin install)`);
          }
        }
        continue;
      }

      // Default: file copy path (all agents, or Claude Code without claude_plugin).
      const src = skillSourcePath(repoDir, skill.subpath);
      if (!src) {
        console.log(`    · ${skill.name}: unsafe upstream subpath`);
        continue;
      }
      const frontmatterName = target.id === "pi" ? await readSkillFrontmatterName(src, skill.kind) : null;
      let installName = skill.name;
      if (target.id === "pi" && frontmatterName) {
        if (isSafeSkillDirName(frontmatterName)) installName = frontmatterName;
        else console.log(`    · ${skill.name}: unsafe Pi frontmatter name ignored: ${frontmatterName}`);
      }
      const dst = safeSkillDirCandidate(target.skillsRoot, installName);
      if (!dst) {
        console.log(`    · ${skill.name}: unsafe install path`);
        continue;
      }
      if (target.id === "pi" && installName !== skill.name) {
        const stale = safeSkillDirCandidate(target.skillsRoot, skill.name);
        if (stale) await removeStalePiSkillDir(stale, skill.name, dryRun);
      }
      const ok = await copySkill(src, dst, skill.kind, dryRun);
      if (ok) {
        await writeUpstreamMirrorMarker(target.id, installName, dryRun);
        console.log(`    ${skill.name}${installName !== skill.name ? ` → ${installName}` : ""}`);
      }
      else console.log(`    · missing upstream path: ${skill.source}:${skill.subpath}`);
    }
    console.log();
  }
  console.log("Done.");
}

async function filteredUpstreamSkills(
  opts: { source?: string; names?: readonly string[]; lockPath?: string },
): Promise<readonly UpstreamSkill[]> {
  const skills = await loadUpstreamSkills(opts.lockPath ?? upstreamLockPath());
  const names = opts.names ? new Set(opts.names) : null;
  return skills.filter((skill) => {
    if (opts.source !== undefined && skill.source !== opts.source) return false;
    if (names && !names.has(skill.name)) return false;
    return true;
  });
}

export async function syncUpstreamSkillsBySource(
  source: string,
  opts: { dryRun?: boolean; updatePins?: boolean; lockPath?: string } = {},
): Promise<void> {
  const skills = await filteredUpstreamSkills({ source, lockPath: opts.lockPath });
  await syncUpstreamSkills({ dryRun: opts.dryRun, updatePins: opts.updatePins, lockPath: opts.lockPath, skills });
}

export async function syncUpstreamSkillsByNames(
  names: readonly string[],
  opts: { dryRun?: boolean; updatePins?: boolean; lockPath?: string } = {},
): Promise<void> {
  const skills = await filteredUpstreamSkills({ names, lockPath: opts.lockPath });
  await syncUpstreamSkills({ dryRun: opts.dryRun, updatePins: opts.updatePins, lockPath: opts.lockPath, skills });
}

async function piFrontmatterInstallName(skill: UpstreamSkill): Promise<string | null> {
  const repoDir = repoCacheDir(skill.source);
  const src = skillSourcePath(repoDir, skill.subpath);
  if (!src) return null;
  return readSkillFrontmatterName(src, skill.kind);
}

function safeSkillDirCandidate(skillsRoot: string, name: string): string | null {
  if (!isSafeSkillDirName(name)) return null;
  const root = resolve(skillsRoot);
  const candidate = resolve(root, name);
  const rel = relative(root, candidate);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return candidate;
}

function lockPlacementName(skill: UpstreamSkill): string | null {
  if (skill.kind === "dir") return basename(skill.subpath);
  const base = basename(skill.subpath).toLowerCase();
  if (base === "skill.md" || base === "skill") return null;
  return basename(skill.subpath, ".md");
}

async function uninstallClaudePlugin(skill: UpstreamSkill, dryRun: boolean): Promise<void> {
  if (!skill.claude_plugin) return;
  const cmd = ["claude", "plugin", "uninstall", skill.claude_plugin.name];
  if (dryRun) {
    console.log(`      [dry-run] would run: ${cmd.join(" ")}`);
    return;
  }
  if (!(await which("claude"))) {
    console.log(`      · claude not on PATH — skip plugin uninstall: ${skill.claude_plugin.name}`);
    return;
  }
  const result = await runProc(cmd, { timeoutMs: 60_000 });
  if (result.exit === 0) {
    console.log(`      uninstalled claude plugin: ${skill.claude_plugin.name}`);
  } else {
    console.log(`      · claude plugin uninstall skipped/failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

export async function removeUpstreamSkills(
  opts: { dryRun?: boolean; source?: string; names?: readonly string[]; lockPath?: string } = {},
): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const skills = await filteredUpstreamSkills({ source: opts.source, names: opts.names, lockPath: opts.lockPath });
  const home = homeDir();

  console.log(`fulcrum upstream skills remove — ${skills.length} curated skill(s)\n`);

  const claudeAgent = AGENTS.find((agent) => agent.id === "claude-code")!;
  if (await isDir(claudeAgent.baseDir(home))) {
    const pluginSkills = skills.filter((skill) =>
      skill.claude_plugin && !skill.vendor_canonical_agents?.includes("claude-code")
    );
    if (pluginSkills.length > 0) {
      console.log("→ Claude Code plugins");
      for (const skill of pluginSkills) {
        await uninstallClaudePlugin(skill, dryRun);
      }
      console.log();
    }
  }

  for (const target of agentTargets(home)) {
    if (!(await isDir(target.baseRoot))) {
      console.log(`· skip ${target.label} (agent skills parent not present)`);
      continue;
    }
    console.log(`→ ${target.label} (${target.skillsRoot})`);

    for (const skill of skills) {
      if (skill.vendor_canonical_agents?.includes(target.id)) {
        console.log(`      · ${skill.name} (vendor-canonical install handles ${target.label}; skip remove)`);
        continue;
      }

      const names = new Set([skill.name]);
      const lockName = lockPlacementName(skill);
      if (lockName) names.add(lockName);

      for (const name of names) {
        const skillPath = safeSkillDirCandidate(target.skillsRoot, name);
        if (skillPath) await removeVendorSkillDir(skillPath, target.id, name, dryRun);
        else console.log(`      · ${skill.name}: unsafe skill dir name ignored: ${name}`);
      }

      if (target.id === "pi") {
        const frontmatterName = await piFrontmatterInstallName(skill);
        if (frontmatterName && !names.has(frontmatterName)) {
          const aliasPath = safeSkillDirCandidate(target.skillsRoot, frontmatterName);
          if (aliasPath) await removeVendorSkillDir(aliasPath, target.id, frontmatterName, dryRun);
          else console.log(`      · ${skill.name}: unsafe Pi frontmatter alias ignored: ${frontmatterName}`);
        }
      }
    }
    console.log();
  }

  console.log("Done.");
}
