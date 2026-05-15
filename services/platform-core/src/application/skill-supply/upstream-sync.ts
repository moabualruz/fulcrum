import type { MikroORM } from "@mikro-orm/postgresql";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

import {
  FulcrumSkill,
  SkillSource,
  SkillVersion,
  SkillConflict,
  SkillConflictKind,
  SkillConflictStatus,
} from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import { initOrm } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { parseKernelMarkdown } from "@platform-core/application/platform-primitives/frontmatter-markdown.ts";
import { AGENT_DIRS, type AgentName } from "./loader.ts";
import { installSkill } from "./loader.ts";
import { readSkillsLockFile, writeSkillsLockFile } from "./lock.ts";

export type SyncResult = {
  merged: string[];
  conflicts: string[];
  errors: string[];
};

const UpstreamSkillFrontmatter = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

let testOrm: MikroORM | undefined;

export function __setSkillsUpstreamSyncOrmForTest(
  orm: MikroORM | undefined,
): void {
  testOrm = orm;
}

interface OrmHandle {
  orm: MikroORM;
  close(): Promise<void>;
}

async function ormForSync(): Promise<OrmHandle> {
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

async function readInstalledSkillContent(
  slug: string,
  agents: AgentName[],
): Promise<string | null> {
  for (const agent of agents) {
    const path = join(expandHome(AGENT_DIRS[agent]), slug, "SKILL.md");
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

async function installedSkillIsClean(
  slug: string,
  agents: AgentName[],
  recordedHash: string,
): Promise<boolean> {
  for (const agent of agents) {
    const path = join(expandHome(AGENT_DIRS[agent]), slug, "SKILL.md");
    try {
      const content = await readFile(path, "utf8");
      if (sha256(content) !== recordedHash) return false;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") continue;
      throw error;
    }
  }
  return true;
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

async function unifiedDiff(
  slug: string,
  localContent: string,
  upstreamContent: string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-skill-diff-"));
  const localPath = join(dir, `${slug}.local.SKILL.md`);
  const upstreamPath = join(dir, `${slug}.upstream.SKILL.md`);
  try {
    await writeFile(localPath, localContent, "utf8");
    await writeFile(upstreamPath, upstreamContent, "utf8");
    const result = await runGit([
      "diff",
      "--no-index",
      "--no-color",
      "--",
      localPath,
      upstreamPath,
    ]);
    if (result.stdout.trim()) return result.stdout;
    return [
      `--- ${slug}.local.SKILL.md`,
      `+++ ${slug}.upstream.SKILL.md`,
      "@@",
      localContent,
      upstreamContent,
    ].join("\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function updateHashVerified(
  orm: MikroORM,
  orgId: string,
  skill: FulcrumSkill,
  version: string,
  hash: string,
): Promise<void> {
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
}

async function upstreamSkillsForOrg(
  orm: MikroORM,
  orgId: string,
): Promise<FulcrumSkill[]> {
  return orm.em.fork().find(FulcrumSkill, {
    org: orgId,
    source: SkillSource.Upstream,
  });
}

export async function syncUpstream(
  orgId: string,
  options: { fetchUpstream: boolean },
): Promise<SyncResult> {
  const result: SyncResult = { merged: [], conflicts: [], errors: [] };
  if (!options.fetchUpstream) return result;

  const ormHandle = await ormForSync();
  try {
    const skills = await upstreamSkillsForOrg(ormHandle.orm, orgId);
    const lock = await readSkillsLockFile();

    for (const skill of skills) {
      const slug = skill.slug;
      const lockEntry = lock[slug];
      const upstreamRepo = skill.upstreamRepo;

      if (!lockEntry || !upstreamRepo) {
        console.warn(`Skipping ${slug}: missing lock entry or upstream_repo`);
        result.errors.push(slug);
        continue;
      }

      const agents = enabledAgentsFor(skill, lockEntry.enabled_agents);
      const cloneParent = await mkdtemp(join(tmpdir(), "fulcrum-skills-upstream-"));
      const cloneDir = join(cloneParent, "repo");

      try {
        await cloneUpstream(upstreamRepo, skill.upstreamRef, cloneDir);
        const upstreamPath = await findSkillMarkdown(cloneDir, slug);
        if (!upstreamPath) {
          throw new Error(`missing SKILL.md for ${slug}`);
        }

        const upstreamContent = await readFile(upstreamPath, "utf8");
        const parsed = UpstreamSkillFrontmatter.parse(
          parseKernelMarkdown(upstreamContent).frontmatter,
        );
        const upstreamHash = sha256(upstreamContent);
        const clean = await installedSkillIsClean(
          slug,
          agents,
          lockEntry.hash,
        );

        if (!clean) {
          const localContent = await readInstalledSkillContent(slug, agents) ?? "";
          // Create structured SkillConflict artifact with kind=upstream_conflict
          // instead of inline conflict diff in lock entry (D-22, D-23).
          const em = ormHandle.orm.em.fork();
          em.create(SkillConflict, {
            slug,
            kind: SkillConflictKind.UpstreamConflict,
            status: SkillConflictStatus.Open,
            localHash: sha256(localContent),
            upstreamHash: upstreamHash,
            baseHash: lockEntry.hash,
            suggestedResolution: `Local content differs from upstream. Options: resolve locally, accept upstream (loses local edits), or edit manually.`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await em.flush();
          lock[slug] = {
            ...lockEntry,
            upstream_conflict: [
              "--- local",
              "+++ upstream",
              localContent,
              upstreamContent,
            ].join("\n"),
          };
          await writeSkillsLockFile(lock);
          result.conflicts.push(slug);
          continue;
        }

        await writeInstalledSkill(slug, agents, upstreamContent);
        await updateHashVerified(
          ormHandle.orm,
          orgId,
          skill,
          parsed.version,
          upstreamHash,
        );
        lock[slug] = {
          version: parsed.version,
          hash: upstreamHash,
          installedAt: new Date().toISOString(),
          enabled_agents: agents,
        };
        result.merged.push(slug);
      } catch (error) {
        console.warn(
          `Failed to sync upstream skill ${slug}: ${(error as Error).message}`,
        );
        result.errors.push(slug);
      } finally {
        await rm(cloneParent, { recursive: true, force: true });
      }
    }

    await writeSkillsLockFile(lock);
    return result;
  } finally {
    await ormHandle.close();
  }
}

async function upstreamSkillRows(
  orm: MikroORM,
  orgId: string,
  slug: string | "all",
): Promise<FulcrumSkill[]> {
  const where = {
    org: orgId,
    source: SkillSource.Upstream,
    upstreamRepo: { $ne: null },
    ...(slug === "all" ? {} : { slug }),
  };
  return orm.em.fork().find(FulcrumSkill, where, { orderBy: { slug: "ASC" } });
}

export async function upgradeSkills(
  orgId: string,
  slug: string | "all",
): Promise<FulcrumSkill[]> {
  const ormHandle = await ormForSync();
  try {
    const skills = await upstreamSkillRows(ormHandle.orm, orgId, slug);
    const upgraded: FulcrumSkill[] = [];

    for (const skill of skills) {
      if (!skill.upstreamRepo) continue;
      const cloneParent = await mkdtemp(join(tmpdir(), "fulcrum-skills-upgrade-"));
      const cloneDir = join(cloneParent, "repo");
      try {
        await cloneUpstream(skill.upstreamRepo, skill.upstreamRef, cloneDir);
        const upstreamPath = await findSkillMarkdown(cloneDir, skill.slug);
        if (!upstreamPath) throw new Error(`missing SKILL.md for ${skill.slug}`);

        await installSkill(upstreamPath, orgId);
        const em = ormHandle.orm.em.fork();
        const reloaded = await em.findOneOrFail(FulcrumSkill, {
          org: orgId,
          slug: skill.slug,
        });
        reloaded.source = SkillSource.Upstream;
        reloaded.upstreamRepo = skill.upstreamRepo;
        reloaded.upstreamRef = skill.upstreamRef;
        await em.flush();
        upgraded.push(reloaded);
      } finally {
        await rm(cloneParent, { recursive: true, force: true });
      }
    }

    return upgraded;
  } finally {
    await ormHandle.close();
  }
}
