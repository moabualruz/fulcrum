import type { EntityManager } from "typeorm";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import {
  FulcrumSkill,
  SkillConflict,
  SkillConflictStatus,
  SkillSource,
  SkillVersion,
} from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import type { AppContext } from "@platform-core/domain/skills.ts";

export interface SkillsWebScope {
  em: EntityManager;
  ctx: AppContext;
}

export interface UpstreamConflict {
  local_content: string;
  upstream_content: string;
}

export interface SkillRow {
  id: string;
  org_id: string;
  slug: string;
  version: string;
  source: "local" | "upstream";
  upstream_repo: string | null;
  content_hash: string | null;
  enabled_agents: string[];
  upstream_conflict: UpstreamConflict | null;
  installed_at: string;
  updated_at: string;
}

export interface InstallSkillInput {
  slug: string;
  upstreamRepo?: string;
}

export interface ResolveConflictInput {
  slug: string;
  resolution: "keep_local" | "use_upstream";
}

const INITIAL_VERSION = "0.0.0";

export async function listWebSkills(scope: SkillsWebScope): Promise<SkillRow[]> {
  const em = scope.em.fork();
  const skills = await em.find(FulcrumSkill, { org: scope.ctx.orgId }, { orderBy: { slug: "ASC" } });
  const rows: SkillRow[] = [];
  for (const skill of skills) {
    rows.push(await serializeWebSkill(em, scope.ctx.orgId, skill));
  }
  return rows;
}

export async function installWebSkill(scope: SkillsWebScope, input: InstallSkillInput): Promise<SkillRow> {
  const slug = input.slug.trim();
  if (!slug) throw new Error("slug is required");

  const em = scope.em.fork();
  const skill = em.create(FulcrumSkill, {
    org: em.getReference(Org, scope.ctx.orgId),
    name: slug,
    slug,
    source: input.upstreamRepo ? SkillSource.Upstream : SkillSource.Local,
    upstreamRepo: input.upstreamRepo ?? undefined,
    enabledAgents: [],
  });
  em.persist(skill);
  em.persist(em.create(SkillVersion, {
    skill,
    version: INITIAL_VERSION,
    hashVerified: null,
  }));
  await em.flush();
  return serializeWebSkill(em, scope.ctx.orgId, skill);
}

export async function upgradeWebSkill(scope: SkillsWebScope, slug: string): Promise<SkillRow> {
  const em = scope.em.fork();
  const skill = await findSkill(em, scope.ctx.orgId, slug);
  const latest = await latestVersion(em, skill);
  const next = bumpPatch(latest?.version ?? INITIAL_VERSION);
  const version = latest?.version === next
    ? latest
    : em.create(SkillVersion, { skill, version: next, hashVerified: latest?.hashVerified ?? null });
  em.persist(version);
  await em.flush();
  return serializeWebSkill(em, scope.ctx.orgId, skill);
}

export async function upgradeAllWebSkills(scope: SkillsWebScope): Promise<SkillRow[]> {
  const skills = await listWebSkills(scope);
  const upgraded: SkillRow[] = [];
  for (const skill of skills) {
    upgraded.push(await upgradeWebSkill(scope, skill.slug));
  }
  return upgraded;
}

export async function uninstallWebSkill(scope: SkillsWebScope, slug: string): Promise<void> {
  const em = scope.em.fork();
  const skill = await findSkill(em, scope.ctx.orgId, slug);
  em.remove(skill);
  await em.flush();
}

export async function updateWebSkillEnabledAgents(
  scope: SkillsWebScope,
  slug: string,
  enabledAgents: string[],
): Promise<SkillRow> {
  const em = scope.em.fork();
  const skill = await findSkill(em, scope.ctx.orgId, slug);
  skill.enabledAgents = enabledAgents;
  await em.flush();
  return serializeWebSkill(em, scope.ctx.orgId, skill);
}

export async function resolveWebSkillConflict(
  scope: SkillsWebScope,
  input: ResolveConflictInput,
): Promise<SkillRow> {
  const em = scope.em.fork();
  const skill = await findSkill(em, scope.ctx.orgId, input.slug);
  const conflict = await em.findOne(SkillConflict, {
    slug: input.slug,
    status: SkillConflictStatus.Open,
  } as never, { orderBy: { createdAt: "DESC" } });
  if (!conflict) throw new Error(`skill '${input.slug}' has no conflict`);

  conflict.status = SkillConflictStatus.Resolved;
  conflict.updatedAt = new Date();
  if (input.resolution === "use_upstream") {
    const latest = await latestVersion(em, skill);
    if (latest) latest.hashVerified = conflict.upstreamHash ?? conflict.actualSha256 ?? latest.hashVerified;
  }
  await em.flush();
  return serializeWebSkill(em, scope.ctx.orgId, skill);
}

async function findSkill(em: EntityManager, orgId: string, slug: string): Promise<FulcrumSkill> {
  const skill = await em.findOne(FulcrumSkill, { org: orgId, slug });
  if (!skill) throw new Error(`skill '${slug}' not found`);
  return skill;
}

async function latestVersion(em: EntityManager, skill: FulcrumSkill): Promise<SkillVersion | null> {
  const versions = await em.find(SkillVersion, { skill } as never);
  return versions.sort((a, b) => compareVersion(b.version, a.version))[0] ?? null;
}

async function openConflict(em: EntityManager, slug: string): Promise<UpstreamConflict | null> {
  const conflict = await em.findOne(SkillConflict, {
    slug,
    status: SkillConflictStatus.Open,
  } as never, { orderBy: { createdAt: "DESC" } });
  if (!conflict) return null;
  return {
    local_content: conflict.localHash ?? conflict.actualSha256 ?? "",
    upstream_content: conflict.upstreamHash ?? conflict.expectedSha256 ?? "",
  };
}

async function serializeWebSkill(em: EntityManager, orgId: string, skill: FulcrumSkill): Promise<SkillRow> {
  const version = await latestVersion(em, skill);
  const now = new Date().toISOString();
  return {
    id: skill.id,
    org_id: orgId,
    slug: skill.slug,
    version: version?.version ?? INITIAL_VERSION,
    source: skill.source === SkillSource.Upstream ? "upstream" : "local",
    upstream_repo: skill.upstreamRepo ?? null,
    content_hash: version?.hashVerified ?? null,
    enabled_agents: skill.enabledAgents,
    upstream_conflict: await openConflict(em, skill.slug),
    installed_at: now,
    updated_at: now,
  };
}

function bumpPatch(version: string): string {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return `${major}.${minor}.${patch + 1}`;
}

function compareVersion(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
