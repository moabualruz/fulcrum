import type { MikroORM } from "@mikro-orm/postgresql";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

import { Org } from "../db/entities/auth/Org.ts";
import {
  FulcrumSkill,
  SkillSource,
  SkillVersion,
} from "../db/entities/skills/index.ts";
import { initOrm } from "../db/mikro-orm.config.ts";
import { parseKernelMarkdown } from "../product-kernel/markdown.ts";
import {
  readSkillsLockFile,
  skillsLockPath,
  writeSkillsLockFile,
} from "./lock.ts";

export const AGENT_DIRS = {
  claude: "~/.claude/skills/",
  codex: "~/.codex/skills/",
  gemini: "~/.gemini/extensions/fulcrum-skills/skills/",
  opencode: "~/.config/opencode/skills/",
  pi: "~/.pi/agent/skills/",
} as const;

export type AgentName = keyof typeof AGENT_DIRS;

const KNOWN_AGENTS = Object.keys(AGENT_DIRS) as AgentName[];

const SkillFrontmatter = z.object({
  name: z.string().min(1),
  agents: z.array(z.union([z.literal("*"), z.enum(KNOWN_AGENTS)])).min(1),
  triggers: z.array(z.string()).default([]),
  version: z.string().min(1),
});

let testOrm: MikroORM | undefined;
let processKillForTest: typeof process.kill | undefined;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 25;
const STALE_LOCK_MS = 60_000;

export function __setSkillsLoaderOrmForTest(orm: MikroORM | undefined): void {
  testOrm = orm;
}

export function __setSkillsLoaderProcessKillForTest(
  fn: typeof process.kill | undefined,
): void {
  processKillForTest = fn;
}

export async function __removeStaleSkillsLockForTest(
  lockDir: string,
): Promise<boolean> {
  return removeStaleLock(lockDir, join(lockDir, "lock.json"));
}

function expandHome(path: string): string {
  if (!path.startsWith("~/")) return path;
  const home = process.env["HOME"];
  if (!home) throw new Error("HOME is required to expand skill install paths.");
  return join(home, path.slice(2));
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertSlug(slug: string, name: string): void {
  if (!slug) {
    throw new Error(`Skill name '${name}' must produce a valid skill slug.`);
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function targetAgents(agents: Array<AgentName | "*">): AgentName[] {
  if (agents.includes("*")) return [...KNOWN_AGENTS];
  return [...new Set(agents)] as AgentName[];
}

async function readInstalledHash(path: string): Promise<string | null> {
  try {
    return sha256(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

interface InstallOrmHandle {
  orm: MikroORM;
  close(): Promise<void>;
}

async function ormForInstall(): Promise<InstallOrmHandle> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSkillsLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockDir = `${skillsLockPath()}.lock`;
  const lockInfoPath = join(lockDir, "lock.json");
  await mkdir(dirname(lockDir), { recursive: true });
  await removeAbandonedStaleLockClaims(lockDir);
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(lockDir);
      await writeFile(
        lockInfoPath,
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        "utf8",
      );
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      if (await removeStaleLock(lockDir, lockInfoPath)) continue;
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out acquiring skills lock at ${lockDir}`);
      }
      await sleep(LOCK_POLL_MS);
    }
  }

  try {
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

async function removeStaleLock(
  lockDir: string,
  lockInfoPath: string,
): Promise<boolean> {
  let parsed: { pid?: unknown; createdAt?: unknown };
  try {
    parsed = JSON.parse(await readFile(lockInfoPath, "utf8")) as {
      pid?: unknown;
      createdAt?: unknown;
    };
  } catch {
    const dirStats = await stat(lockDir).catch(() => null);
    if (!dirStats || Date.now() - dirStats.mtimeMs <= STALE_LOCK_MS) {
      return false;
    }
    parsed = { pid: null, createdAt: new Date(dirStats.mtimeMs).toISOString() };
  }

  const pid = typeof parsed.pid === "number" ? parsed.pid : null;
  const createdAt = typeof parsed.createdAt === "string"
    ? Date.parse(parsed.createdAt)
    : NaN;
  const lockIsOld = Number.isFinite(createdAt) && Date.now() - createdAt > STALE_LOCK_MS;
  const ownerDead = pid !== null && !isProcessAlive(pid);
  if (!ownerDead && !lockIsOld) return false;

  const claimedDir = `${lockDir}.stale-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  try {
    await rename(lockDir, claimedDir);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return false;
    throw error;
  }
  await rm(claimedDir, { recursive: true, force: true });
  return true;
}

async function removeAbandonedStaleLockClaims(lockDir: string): Promise<void> {
  const parent = dirname(lockDir);
  const stalePrefix = `${basename(lockDir)}.stale-`;
  const entries = await readdir(parent, { withFileTypes: true }).catch(
    (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    },
  );

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(stalePrefix)) continue;
    // Best-effort cleanup: active lock recovery owns the atomic rename; losing
    // cleaners may see ENOENT, and force:true keeps that race harmless.
    await rm(join(parent, entry.name), { recursive: true, force: true });
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    (processKillForTest ?? process.kill)(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function writeNullHash(
  orm: MikroORM,
  orgId: string,
  name: string,
  slug: string,
  version: string,
  agents: AgentName[],
): Promise<void> {
  const em = orm.em.fork();
  let skill = await em.findOne(FulcrumSkill, { org: orgId, slug }) as
    | FulcrumSkill
    | null;

  if (!skill) {
    skill = em.create(FulcrumSkill, {
      org: em.getReference(Org, orgId),
      name,
      slug,
      source: SkillSource.Local,
      enabledAgents: agents,
    });
  } else {
    skill.name = name;
    skill.source = SkillSource.Local;
    skill.enabledAgents = agents;
  }

  let skillVersion = await em.findOne(SkillVersion, { skill, version });
  if (!skillVersion) {
    skillVersion = em.create(SkillVersion, {
      skill,
      version,
      hashVerified: null,
    });
  } else {
    skillVersion.hashVerified = null;
  }
  await em.flush();
}

async function upsertSkillRow(
  orm: MikroORM,
  orgId: string,
  name: string,
  slug: string,
  version: string,
  agents: AgentName[],
  hash: string | null,
): Promise<FulcrumSkill> {
  const em = orm.em.fork();
  let skill = await em.findOne(FulcrumSkill, { org: orgId, slug }) as
    | FulcrumSkill
    | null;

  if (!skill) {
    skill = em.create(FulcrumSkill, {
      org: em.getReference(Org, orgId),
      name,
      slug,
      source: SkillSource.Local,
      enabledAgents: agents,
    });
  } else {
    skill.name = name;
    skill.source = SkillSource.Local;
    skill.enabledAgents = agents;
  }

  let skillVersion = await em.findOne(SkillVersion, { skill, version });
  if (!skillVersion) {
    skillVersion = em.create(SkillVersion, {
      skill,
      version,
      hashVerified: hash,
    });
  } else {
    skillVersion.hashVerified = hash;
  }

  await em.flush();
  return skill;
}

async function copyToAgents(
  slug: string,
  content: string,
  agents: AgentName[],
  expectedExistingHash: string | undefined,
): Promise<void> {
  const nextHash = sha256(content);

  for (const agent of agents) {
    const agentDir = expandHome(AGENT_DIRS[agent]);
    const target = join(agentDir, slug, "SKILL.md");
    const installedHash = await readInstalledHash(target);

    if (
      expectedExistingHash !== undefined &&
      installedHash !== null &&
      installedHash !== expectedExistingHash
    ) {
      throw new Error(
        `Skill hash mismatch for ${slug} in ${agent}: expected ${expectedExistingHash}, got ${installedHash}`,
      );
    }

    if (installedHash === nextHash) continue;

    if (installedHash === null) {
      console.warn(`Missing agent skill dir; creating ${dirname(target)}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

export async function installSkill(
  skillPath: string,
  orgId: string,
): Promise<FulcrumSkill> {
  const content = await readFile(skillPath, "utf8");
  let parsed: z.infer<typeof SkillFrontmatter>;
  try {
    parsed = SkillFrontmatter.parse(parseKernelMarkdown(content).frontmatter);
  } catch (error) {
    console.error("Skipping invalid skill frontmatter in %s", skillPath, error);
    throw error;
  }

  const slug = slugify(parsed.name);
  assertSlug(slug, parsed.name);
  const agents = targetAgents(parsed.agents);
  const hash = sha256(content);
  const installOrm = await ormForInstall();

  try {
    return await withSkillsLock(async () => {
      const lock = await readSkillsLockFile();

      try {
        await copyToAgents(slug, content, agents, lock[slug]?.hash);
      } catch (error) {
        await writeNullHash(
          installOrm.orm,
          orgId,
          parsed.name,
          slug,
          parsed.version,
          agents,
        );
        throw error;
      }

      const skill = await upsertSkillRow(
        installOrm.orm,
        orgId,
        parsed.name,
        slug,
        parsed.version,
        agents,
        hash,
      );

      lock[slug] = {
        version: parsed.version,
        hash,
        installedAt: new Date().toISOString(),
        enabled_agents: agents,
      };
      await writeSkillsLockFile(lock);

      return skill;
    });
  } finally {
    await installOrm.close();
  }
}
