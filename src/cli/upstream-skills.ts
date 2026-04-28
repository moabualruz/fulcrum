// Curated third-party skill sync.
//
// Installs upstream SKILL.md folders under a separate managed namespace so
// authored Fulcrum skills (`fulcrum/`) do not mix with vendored packs.

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTS } from "../agents/registry.ts";
import { cloneOrUpdate } from "../utils/proc.ts";

const UPSTREAM_NAMESPACE = "fulcrum-upstream";

export interface UpstreamSkill {
  name: string;
  repo: string;
  path: string;
  kind?: "dir" | "file";
}

export const UPSTREAM_SKILLS: readonly UpstreamSkill[] = [
  { name: "superpowers-brainstorming", repo: "https://github.com/obra/superpowers", path: "skills/brainstorming" },
  { name: "superpowers-writing-plans", repo: "https://github.com/obra/superpowers", path: "skills/writing-plans" },
  { name: "superpowers-systematic-debugging", repo: "https://github.com/obra/superpowers", path: "skills/systematic-debugging" },
  { name: "superpowers-requesting-code-review", repo: "https://github.com/obra/superpowers", path: "skills/requesting-code-review" },
  { name: "superpowers-using-git-worktrees", repo: "https://github.com/obra/superpowers", path: "skills/using-git-worktrees" },
  { name: "superpowers-using-superpowers", repo: "https://github.com/obra/superpowers", path: "skills/using-superpowers" },
  { name: "ast-grep", repo: "https://github.com/ast-grep/agent-skill", path: "ast-grep/skills/ast-grep" },
  { name: "tavily-best-practices", repo: "https://github.com/tavily-ai/skills", path: "skills/tavily-best-practices" },
  { name: "tavily-cli", repo: "https://github.com/tavily-ai/skills", path: "skills/tavily-cli" },
  { name: "tavily-crawl", repo: "https://github.com/tavily-ai/skills", path: "skills/tavily-crawl" },
  { name: "tavily-extract", repo: "https://github.com/tavily-ai/skills", path: "skills/tavily-extract" },
  { name: "tavily-map", repo: "https://github.com/tavily-ai/skills", path: "skills/tavily-map" },
  { name: "tavily-research", repo: "https://github.com/tavily-ai/skills", path: "skills/tavily-research" },
  { name: "tavily-search", repo: "https://github.com/tavily-ai/skills", path: "skills/tavily-search" },
  { name: "playwright-cli", repo: "https://github.com/microsoft/playwright-cli", path: "skills/playwright-cli" },
  { name: "semgrep", repo: "https://github.com/semgrep/skills", path: "skills/semgrep" },
  { name: "semgrep-code-security", repo: "https://github.com/semgrep/skills", path: "skills/code-security" },
  { name: "semgrep-llm-security", repo: "https://github.com/semgrep/skills", path: "skills/llm-security" },
  { name: "graphify", repo: "https://github.com/safishamsi/graphify", path: "graphify/skill.md", kind: "file" },
  { name: "ctx7", repo: "https://github.com/edxeth/superlight-context7-skill", path: "SKILL.md", kind: "file" },
];

function homeDir(): string {
  return process.env["HOME"] ?? "";
}

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? `${homeDir()}/.fulcrum`;
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

async function ensureRepo(repo: string, dryRun: boolean): Promise<string | null> {
  const dir = repoCacheDir(repo);
  if (dryRun) {
    console.log(`  [dry-run] would clone/update ${repo} → ${dir}`);
    return dir;
  }
  const result = await cloneOrUpdate(repo, dir);
  if (result.exit !== 0) {
    console.log(`  ✗ ${repo} clone/update failed: ${result.stderr.trim()}`);
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

export async function syncUpstreamSkills(opts: { dryRun?: boolean; skills?: readonly UpstreamSkill[] } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const skills = opts.skills ?? UPSTREAM_SKILLS;
  const home = homeDir();

  console.log(`fulcrum upstream skills sync — ${skills.length} curated skill(s)\n`);

  const repos = Array.from(new Set(skills.map((s) => s.repo)));
  const repoDirs = new Map<string, string>();
  for (const repo of repos) {
    const dir = await ensureRepo(repo, dryRun);
    if (dir) repoDirs.set(repo, dir);
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
      const repoDir = repoDirs.get(skill.repo);
      if (!repoDir) continue;
      const src = `${repoDir}/${skill.path}`;
      const ok = await copySkill(src, `${target.skillsRoot}/${skill.name}`, skill.kind ?? "dir", dryRun);
      if (ok) console.log(`    ${UPSTREAM_NAMESPACE}/${skill.name}`);
      else console.log(`    · missing upstream path: ${skill.repo}:${skill.path}`);
    }
    console.log();
  }
  console.log("Done.");
}
