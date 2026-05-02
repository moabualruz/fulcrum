import type { MikroORM } from "@mikro-orm/postgresql";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

export function __setSkillsLoaderOrmForTest(orm: MikroORM | undefined): void {
  testOrm = orm;
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

async function ormForInstall(): Promise<MikroORM> {
  return testOrm ?? initOrm();
}

async function writeNullHash(
  orm: MikroORM,
  orgId: string,
  slug: string,
  version: string,
): Promise<void> {
  const em = orm.em.fork();
  const skill = await em.findOne(FulcrumSkill, { org: orgId, slug });
  if (!skill) return;

  let skillVersion = await em.findOne(SkillVersion, { skill, version });
  if (!skillVersion) {
    skillVersion = em.create(SkillVersion, {
      skill,
      version,
      hashVerified: null as unknown as string | undefined,
    });
  } else {
    skillVersion.hashVerified = null as unknown as string | undefined;
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
  hash: string,
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
    console.error(`Skipping invalid skill frontmatter in ${skillPath}`, error);
    throw error;
  }

  const slug = slugify(parsed.name);
  const agents = targetAgents(parsed.agents);
  const hash = sha256(content);
  const orm = await ormForInstall();
  const lock = await readSkillsLockFile();

  try {
    await copyToAgents(slug, content, agents, lock[slug]?.hash);
  } catch (error) {
    await writeNullHash(orm, orgId, slug, parsed.version);
    throw error;
  }

  const skill = await upsertSkillRow(
    orm,
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
}
