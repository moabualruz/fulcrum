import type { MikroORM } from "@mikro-orm/postgresql";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

import {
  FulcrumSkill,
  SkillVersion,
} from "../db/entities/skills/index.ts";
import { initOrm } from "../db/mikro-orm.config.ts";
import { parseKernelMarkdown } from "../shared/markdown.ts";
import { AGENT_DIRS, type AgentName } from "./loader.ts";
import { readSkillsLockFile, writeSkillsLockFile } from "./lock.ts";

export type ConflictResolution = "local" | "upstream" | "editor";

const SkillFrontmatter = z.object({
  version: z.string().min(1),
});

let testOrm: MikroORM | undefined;

export function __setSkillsConflictResolverOrmForTest(
  orm: MikroORM | undefined,
): void {
  testOrm = orm;
}

interface OrmHandle {
  orm: MikroORM;
  close(): Promise<void>;
}

async function ormForResolve(): Promise<OrmHandle> {
  if (testOrm) {
    return {
      orm: testOrm,
      close: async () => undefined,
    };
  }

  const orm = await initOrm();
  return {
    orm,
    close: async () => {
      await orm.close(true);
    },
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function expandHome(path: string): string {
  if (!path.startsWith("~/")) return path;
  const home = process.env["HOME"];
  if (!home) throw new Error("HOME is required to expand skill install paths.");
  return join(home, path.slice(2));
}

function enabledAgentsFor(skill: FulcrumSkill, lockAgents: string[]): AgentName[] {
  const agents = lockAgents.length > 0 ? lockAgents : skill.enabledAgents;
  return agents.filter((agent): agent is AgentName => agent in AGENT_DIRS);
}

async function runGit(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function cloneUpstream(
  repo: string,
  ref: string | undefined,
  destination: string,
): Promise<void> {
  const args = ["clone", "--depth", "1"];
  if (ref) args.push("--branch", ref);
  args.push(repo, destination);
  const result = await runGit(args);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `git clone exited ${result.exitCode}`);
  }
}

async function findSkillMarkdown(
  root: string,
  slug: string,
): Promise<string | null> {
  const candidates = [
    join(root, "skills", slug, "SKILL.md"),
    join(root, slug, "SKILL.md"),
    join(root, "SKILL.md"),
  ];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
  }

  return findSkillMarkdownRecursive(root, slug);
}

async function findSkillMarkdownRecursive(
  dir: string,
  slug: string,
): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error) => {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    const candidate = join(child, "SKILL.md");
    if (entry.name === slug) {
      try {
        await readFile(candidate, "utf8");
        return candidate;
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
    }
    const nested = await findSkillMarkdownRecursive(child, slug);
    if (nested) return nested;
  }

  return null;
}

async function readUpstreamSkill(skill: FulcrumSkill): Promise<string> {
  if (!skill.upstreamRepo) {
    throw new Error(`Cannot resolve ${skill.slug} from upstream: missing upstream_repo`);
  }

  const cloneParent = await mkdtemp(join(tmpdir(), "fulcrum-skills-resolve-"));
  const cloneDir = join(cloneParent, "repo");
  try {
    await cloneUpstream(skill.upstreamRepo, skill.upstreamRef, cloneDir);
    const skillPath = await findSkillMarkdown(cloneDir, skill.slug);
    if (!skillPath) throw new Error(`missing SKILL.md for ${skill.slug}`);
    return await readFile(skillPath, "utf8");
  } finally {
    await rm(cloneParent, { recursive: true, force: true });
  }
}

async function writeInstalledSkill(
  slug: string,
  agents: AgentName[],
  content: string,
): Promise<void> {
  for (const agent of agents) {
    const path = join(expandHome(AGENT_DIRS[agent]), slug, "SKILL.md");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}

async function firstInstalledSkillPath(
  slug: string,
  agents: AgentName[],
): Promise<string> {
  const agent = agents[0];
  if (!agent) throw new Error(`Cannot resolve ${slug}: no enabled agents`);
  return join(expandHome(AGENT_DIRS[agent]), slug, "SKILL.md");
}

async function openEditor(path: string): Promise<void> {
  const editor = process.env["EDITOR"];
  if (!editor) throw new Error("EDITOR is required for manual skill conflict resolution.");
  const proc = Bun.spawn([editor, path], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`EDITOR exited ${exitCode}`);
  }
}

async function updateHashVerified(
  orm: MikroORM,
  orgId: string,
  skill: FulcrumSkill,
  version: string,
  hash: string,
): Promise<FulcrumSkill> {
  const em = orm.em.fork();
  const reloaded = await em.findOneOrFail(FulcrumSkill, {
    org: orgId,
    slug: skill.slug,
  });
  let skillVersion = await em.findOne(SkillVersion, {
    skill: reloaded,
    version,
  });
  if (!skillVersion) {
    skillVersion = em.create(SkillVersion, {
      skill: reloaded,
      version,
      hashVerified: hash,
    });
  } else {
    skillVersion.hashVerified = hash;
  }
  await em.flush();
  return reloaded;
}

export async function resolveConflict(
  slug: string,
  resolution: ConflictResolution,
  orgId: string,
): Promise<FulcrumSkill> {
  const ormHandle = await ormForResolve();
  try {
    const em = ormHandle.orm.em.fork();
    const skill = await em.findOneOrFail(FulcrumSkill, {
      org: orgId,
      slug,
    });
    const lock = await readSkillsLockFile();
    const lockEntry = lock[slug];
    if (!lockEntry?.upstream_conflict) return skill;

    const agents = enabledAgentsFor(skill, lockEntry.enabled_agents);
    let version = lockEntry.version;
    let hash = lockEntry.hash;

    if (resolution === "upstream") {
      const upstreamContent = await readUpstreamSkill(skill);
      const parsed = SkillFrontmatter.parse(
        parseKernelMarkdown(upstreamContent).frontmatter,
      );
      version = parsed.version;
      hash = sha256(upstreamContent);
      await writeInstalledSkill(slug, agents, upstreamContent);
      await updateHashVerified(ormHandle.orm, orgId, skill, version, hash);
    } else if (resolution === "editor") {
      const path = await firstInstalledSkillPath(slug, agents);
      await openEditor(path);
      const content = await readFile(path, "utf8");
      const parsed = SkillFrontmatter.parse(
        parseKernelMarkdown(content).frontmatter,
      );
      version = parsed.version;
      hash = sha256(content);
      await updateHashVerified(ormHandle.orm, orgId, skill, version, hash);
    }

    lock[slug] = {
      version,
      hash,
      installedAt: new Date().toISOString(),
      enabled_agents: agents,
    };
    await writeSkillsLockFile(lock);

    return ormHandle.orm.em.fork().findOneOrFail(FulcrumSkill, {
      org: orgId,
      slug,
    });
  } finally {
    await ormHandle.close();
  }
}
