import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { SkillConflict, SkillConflictStatus } from "@platform-core/infrastructure/application-database/entities/skills/SkillConflict.ts";
import { resolveConflict } from "@platform-core/application/skill-supply/conflict-resolver.ts";
import { installSkill, uninstallSkill } from "@platform-core/application/skill-supply/loader.ts";
import { readSkillsLockFile, writeSkillsLockFile } from "@platform-core/application/skill-supply/lock.ts";
import { syncUpstream, upgradeSkills } from "@platform-core/application/skill-supply/upstream-sync.ts";
import type { AppContext, SkillDto } from "@platform-core/domain/skills.ts";
import { serializeSkill } from "@platform-core/application/skills/queries.ts";

export interface SyncSkillsInput {
  fetchUpstream: boolean;
}

export async function installFulcrumSkill(ctx: AppContext, path: string): Promise<SkillDto> {
  return serializeSkill(await installSkill(path, ctx.orgId));
}

export async function upgradeFulcrumSkills(ctx: AppContext, slug: string): Promise<SkillDto[]> {
  return (await upgradeSkills(ctx.orgId, slug)).map(serializeSkill);
}

export async function uninstallFulcrumSkill(ctx: AppContext, slug: string): Promise<void> {
  await uninstallSkill(slug, ctx.orgId);
}

export async function syncFulcrumSkills(ctx: AppContext, input: SyncSkillsInput) {
  return syncUpstream(ctx.orgId, input);
}

export async function resolveFulcrumSkillConflict(
  ctx: AppContext,
  slug: string,
  resolution: "local" | "upstream" | "editor",
): Promise<SkillDto> {
  return serializeSkill(await resolveConflict(slug, resolution, ctx.orgId));
}

export async function overrideSkillConflict(
  em: EntityManager,
  ctx: AppContext,
  input: { conflictId: string; auditNote: string; resolution: "local" | "upstream" },
): Promise<{ ok: true }> {
  const scopedEm = em.fork();
  const conflict = await scopedEm.findOne(SkillConflict, { id: input.conflictId });
  if (!conflict) throw new Error(`Conflict ${input.conflictId} not found`);
  conflict.status = SkillConflictStatus.Overridden;
  conflict.auditNote = input.auditNote;
  if (input.resolution === "upstream" && conflict.slug) {
    try {
      await resolveConflict(conflict.slug, "upstream", ctx.orgId);
      conflict.status = SkillConflictStatus.Resolved;
    } catch {
      // Resolution may fail if upstream repo is unavailable; audit note still records override.
    }
  }
  await scopedEm.flush();
  return { ok: true };
}

export async function overrideSkillLock(
  em: EntityManager | null,
  ctx: AppContext,
  input: { slug: string; expectedSha256: string; actualSha256: string; auditNote?: string },
): Promise<{ ok: true }> {
  const lock = await readSkillsLockFile();
  const existing = lock[input.slug] ?? {
    version: "0.0.0",
    hash: "",
    installedAt: new Date().toISOString(),
    enabled_agents: [],
  };
  lock[input.slug] = {
    version: existing.version,
    hash: input.actualSha256,
    installedAt: new Date().toISOString(),
    enabled_agents: existing.enabled_agents,
  };
  await writeSkillsLockFile(lock);
  await recordLockOverrideAudit(em, ctx, input);
  return { ok: true };
}

async function recordLockOverrideAudit(
  em: EntityManager | null,
  ctx: AppContext,
  input: { slug: string; expectedSha256: string; actualSha256: string; auditNote?: string },
): Promise<void> {
  if (!em) return;
  try {
    const auditEm = em.fork();
    const org = await auditEm.findOne(Org, { id: ctx.orgId });
    if (!org) return;
    const event = auditEm.create(Event, {
      org,
      actor: "system",
      verb: "lock_override",
      subjectKind: "skill",
      subjectId: `${input.slug}:${input.expectedSha256}->${input.actualSha256}`,
      payload: {
        slug: input.slug,
        expectedSha256: input.expectedSha256,
        actualSha256: input.actualSha256,
        auditNote: input.auditNote ?? null,
      },
    } as never);
    auditEm.persist(event);
    await auditEm.flush();
  } catch {
    // Audit is best-effort.
  }
}
