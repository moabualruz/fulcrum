import type { DataSource } from "typeorm";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import {
  FulcrumSkill,
  SkillSource,
  SkillVersion,
} from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import { initDataSource } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { parseKernelMarkdown } from "@platform-core/application/platform-primitives/frontmatter-markdown.ts";
import {
  readSkillsLockFile,
  skillsLockPath,
  verifySkillLock,
  writeSkillsLockFile,
} from "./lock.ts";

export const AGENT_DIRS = {
  claude: "~/.claude/skills",
  codex: "~/.codex/skills",
  gemini: "~/.gemini/extensions/fulcrum-skills/skills",
  opencode: "~/.config/opencode/skills",
  pi: "~/.pi/agent/skills",
} as const;

export type AgentName = keyof typeof AGENT_DIRS;

const ALL_AGENTS = Object.keys(AGENT_DIRS) as AgentName[];
const STALE_LOCK_MS = 60_000;

const SkillFrontmatter = z.object({
  name: z.string().min(1),
  version: z.coerce.string().min(1),
  agents: z.array(z.string().min(1)).default(["*"]),
});

let testDataSource: DataSource | undefined;
let processKill: (pid: number, signal?: NodeJS.Signals | 0) => true = process.kill;

export function __setSkillsLoaderOrmForTest(ds: DataSource | undefined): void {
  testDataSource = ds;
}

export function __setSkillsLoaderProcessKillForTest(
  kill: typeof processKill | undefined,
): void {
  processKill = kill ?? process.kill;
}

interface DataSourceHandle {
  dataSource: DataSource;
  close(): Promise<void>;
}

async function dsForLoader(): Promise<DataSourceHandle> {
  if (testDataSource) {
    return {
      dataSource: testDataSource,
      close: async () => undefined,
    };
  }

  const dataSource = await initDataSource();
  return {
    dataSource,
    close: async () => {
      await dataSource.destroy();
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

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSkillContent(content: string): {
  name: string;
  slug: string;
  version: string;
  agents: AgentName[];
} {
  const parsed = SkillFrontmatter.parse(parseKernelMarkdown(content).frontmatter);
  const slug = slugify(parsed.name);
  if (!slug) throw new Error(`Skill name "${parsed.name}" does not produce a valid skill slug.`);

  const agents = parsed.agents.includes("*")
    ? ALL_AGENTS
    : parsed.agents.filter((agent): agent is AgentName => agent in AGENT_DIRS);
  if (agents.length === 0) throw new Error(`Skill ${slug} has no supported agents.`);

  return {
    name: parsed.name,
    slug,
    version: parsed.version,
    agents,
  };
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function installedSkillPath(agent: AgentName, slug: string): Promise<string> {
  return join(expandHome(AGENT_DIRS[agent]), slug, "SKILL.md");
}

async function assertInstalledHashes(
  slug: string,
  agents: AgentName[],
  expectedHash: string,
): Promise<void> {
  for (const agent of agents) {
    const path = await installedSkillPath(agent, slug);
    const content = await readIfExists(path);
    if (content === null) continue;
    const result = verifySkillLock(slug, expectedHash, content);
    if (result.status !== "ok") {
      throw new Error(
        `Skill ${slug} hash mismatch at ${path}: expected=${result.expectedSha256} actual=${result.actualSha256} available=${result.available}`,
      );
    }
  }
}

async function copySkillToAgents(
  skillPath: string,
  slug: string,
  agents: AgentName[],
  hash: string,
): Promise<void> {
  for (const agent of agents) {
    const target = await installedSkillPath(agent, slug);
    const current = await readIfExists(target);
    if (current !== null && sha256(current) === hash) continue;
    await mkdir(dirname(target), { recursive: true });
    await copyFile(skillPath, target);
  }
}

async function upsertSkillRow(
  dataSource: DataSource,
  orgId: string,
  input: {
    name: string;
    slug: string;
    version: string;
    agents: AgentName[];
    hashVerified: string | null;
  },
): Promise<FulcrumSkill> {
  const skillRepo = dataSource.getRepository(FulcrumSkill);
  const versionRepo = dataSource.getRepository(SkillVersion);

  let skill = await skillRepo.findOne({
    where: { org: { id: orgId }, slug: input.slug },
  });

  if (!skill) {
    skill = skillRepo.create({
      org: { id: orgId } as Org,
      name: input.name,
      slug: input.slug,
      source: SkillSource.Local,
      enabledAgents: input.agents,
    });
  } else {
    skill.name = input.name;
    skill.source = SkillSource.Local;
    skill.enabledAgents = input.agents;
  }
  await skillRepo.save(skill);

  let version = await versionRepo.findOne({
    where: { skill: { id: skill.id }, version: input.version },
  });
  if (!version) {
    version = versionRepo.create({
      skill,
      version: input.version,
      hashVerified: input.hashVerified,
    });
  } else {
    version.hashVerified = input.hashVerified;
  }
  await versionRepo.save(version);
  return skill;
}

async function setLatestHashVerified(
  dataSource: DataSource,
  orgId: string,
  slug: string,
  version: string,
  hashVerified: string | null,
): Promise<void> {
  const skillRepo = dataSource.getRepository(FulcrumSkill);
  const versionRepo = dataSource.getRepository(SkillVersion);
  const skill = await skillRepo.findOneOrFail({ where: { org: { id: orgId }, slug } });
  let skillVersion = await versionRepo.findOne({ where: { skill: { id: skill.id }, version } });
  if (!skillVersion) {
    skillVersion = versionRepo.create({ skill, version, hashVerified });
  } else {
    skillVersion.hashVerified = hashVerified;
  }
  await versionRepo.save(skillVersion);
}

async function latestHashVerified(
  dataSource: DataSource,
  orgId: string,
  slug: string,
  version: string,
): Promise<string | null> {
  const skillRepo = dataSource.getRepository(FulcrumSkill);
  const versionRepo = dataSource.getRepository(SkillVersion);
  const skill = await skillRepo.findOne({ where: { org: { id: orgId }, slug } });
  if (!skill) return null;
  const skillVersion = await versionRepo.findOne({ where: { skill: { id: skill.id }, version } });
  return skillVersion?.hashVerified ?? null;
}

async function cleanupOrphanedStaleClaims(lockDir: string): Promise<void> {
  const parent = dirname(lockDir);
  const prefix = `${lockDir.slice(parent.length + 1)}.stale-`;
  const entries = await readdir(parent, { withFileTypes: true }).catch((error) => {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  });

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
      .map((entry) => rm(join(parent, entry.name), { recursive: true, force: true })),
  );
}

export async function __removeStaleSkillsLockForTest(lockDir: string): Promise<boolean> {
  return removeStaleSkillsLock(lockDir);
}

async function removeStaleSkillsLock(lockDir: string): Promise<boolean> {
  const claimDir = `${lockDir}.stale-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

  let lockStat;
  try {
    lockStat = await stat(lockDir);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return false;
    throw error;
  }

  let shouldRemove = false;
  const lockJson = join(lockDir, "lock.json");
  try {
    const parsed = JSON.parse(await readFile(lockJson, "utf8")) as { pid?: unknown };
    if (typeof parsed.pid !== "number") {
      shouldRemove = Date.now() - lockStat.mtimeMs > STALE_LOCK_MS;
    } else {
      try {
        processKill(parsed.pid, 0);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "ESRCH") shouldRemove = true;
        else if (code === "EPERM") return false;
        else throw error;
      }
    }
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT" || error instanceof SyntaxError) {
      shouldRemove = Date.now() - lockStat.mtimeMs > STALE_LOCK_MS;
    } else {
      throw error;
    }
  }

  if (!shouldRemove) return false;

  try {
    await rename(lockDir, claimDir);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return false;
    throw error;
  }
  await rm(claimDir, { recursive: true, force: true });
  return true;
}

async function withSkillsLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockFile = skillsLockPath();
  const lockDir = `${lockFile}.lock`;
  await mkdir(dirname(lockDir), { recursive: true });
  await cleanupOrphanedStaleClaims(lockDir);
  await removeStaleSkillsLock(lockDir);

  try {
    await mkdir(lockDir);
  } catch (error) {
    if ((error as { code?: string }).code === "EEXIST") {
      throw new Error(`Skills lock is held at ${lockDir}`);
    }
    throw error;
  }

  try {
    await writeFile(
      join(lockDir, "lock.json"),
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
      "utf8",
    );
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

export async function installSkill(path: string, orgId: string): Promise<FulcrumSkill> {
  const content = await readFile(path, "utf8");
  const parsed = parseSkillContent(content);
  const hash = sha256(content);
  const handle = await dsForLoader();

  try {
    return await withSkillsLock(async () => {
      const previousHash = await latestHashVerified(
        handle.dataSource,
        orgId,
        parsed.slug,
        parsed.version,
      );
      await upsertSkillRow(handle.dataSource, orgId, {
        ...parsed,
        hashVerified: null,
      });

      try {
        if (previousHash === hash) {
          await assertInstalledHashes(parsed.slug, parsed.agents, hash);
        }
        await copySkillToAgents(path, parsed.slug, parsed.agents, hash);
        await assertInstalledHashes(parsed.slug, parsed.agents, hash);
      } catch (error) {
        await setLatestHashVerified(
          handle.dataSource,
          orgId,
          parsed.slug,
          parsed.version,
          null,
        );
        throw error;
      }

      const skill = await upsertSkillRow(handle.dataSource, orgId, {
        ...parsed,
        hashVerified: hash,
      });
      const lock = await readSkillsLockFile();
      lock[parsed.slug] = {
        version: parsed.version,
        hash,
        installedAt: new Date().toISOString(),
        enabled_agents: parsed.agents,
      };
      await writeSkillsLockFile(lock);
      return skill;
    });
  } finally {
    await handle.close();
  }
}

export async function listInstalledSkills(orgId: string): Promise<FulcrumSkill[]> {
  const handle = await dsForLoader();
  try {
    const skillRepo = handle.dataSource.getRepository(FulcrumSkill);
    return await skillRepo.find({
      where: { org: { id: orgId } },
      order: { slug: "ASC" },
    });
  } finally {
    await handle.close();
  }
}

export async function uninstallSkill(slug: string, orgId: string): Promise<void> {
  const handle = await dsForLoader();
  try {
    await withSkillsLock(async () => {
      const skillRepo = handle.dataSource.getRepository(FulcrumSkill);
      const skill = await skillRepo.findOneOrFail({ where: { org: { id: orgId }, slug } });
      const agents = skill.enabledAgents.filter((agent): agent is AgentName => agent in AGENT_DIRS);

      await Promise.all(
        agents.map(async (agent) => {
          const target = join(expandHome(AGENT_DIRS[agent]), slug);
          await rm(target, { recursive: true, force: true });
        }),
      );

      const lock = await readSkillsLockFile();
      delete lock[slug];
      await writeSkillsLockFile(lock);
      await skillRepo.remove(skill);
    });
  } finally {
    await handle.close();
  }
}

/**
 * Read SKILL.md content for a given skill slug.
 */
export async function readSkillContent(
  slug: string,
  _orgId: string,
  repoRoot: string,
): Promise<string | null> {
  const skillPath = join(repoRoot, "skills", slug, "SKILL.md");
  try {
    await stat(skillPath);
  } catch {
    console.warn(`[skills/loader] skill slug "${slug}" not found at ${skillPath}`);
    return null;
  }
  try {
    return await readFile(skillPath, "utf-8");
  } catch {
    console.warn(`[skills/loader] failed to read SKILL.md for slug "${slug}"`);
    return null;
  }
}
