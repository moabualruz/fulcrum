import type { EntityManager } from "typeorm";

import { FulcrumSkill } from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import { SkillConflict } from "@platform-core/infrastructure/application-database/entities/skills/SkillConflict.ts";
import { listInstalledSkills } from "@platform-core/application/skill-supply/loader.ts";
import { SkillRegistryService } from "@platform-core/application/skill-supply/registry-service.ts";
import type { AppContext, SkillConflictDto, SkillDto, SkillRegistryEntryDto } from "@platform-core/domain/skills.ts";

export async function listSkills(ctx: AppContext): Promise<SkillDto[]> {
  return (await listInstalledSkills(ctx.orgId)).map(serializeSkill);
}

export async function listRegistrySkills(
  em: EntityManager | null,
  ctx: AppContext,
): Promise<SkillRegistryEntryDto[]> {
  if (!em) return SkillRegistryService.list(ctx.orgId);
  const skills = await em.find(FulcrumSkill, { where: { org: { id: ctx.orgId } } as never, order: { slug: "ASC" } });
  return skills.map((skill) => ({
    slug: skill.slug,
    name: skill.name,
    source: skill.source === "upstream" ? "upstream" : "local",
    version: null,
    enabledAgents: skill.enabledAgents,
  }));
}

export async function listSkillConflicts(em: EntityManager): Promise<SkillConflictDto[]> {
  const conflicts = await em.find(SkillConflict, { where: {}, order: { createdAt: "DESC" } });
  return conflicts.map((c) => ({
    id: c.id,
    slug: c.slug,
    kind: c.kind,
    status: c.status,
    localHash: c.localHash,
    upstreamHash: c.upstreamHash,
    baseHash: c.baseHash,
    expectedSha256: c.expectedSha256,
    actualSha256: c.actualSha256,
    suggestedResolution: c.suggestedResolution,
    auditNote: c.auditNote,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

export function serializeSkill(skill: FulcrumSkill): SkillDto {
  return {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    source: skill.source,
    upstreamRepo: skill.upstreamRepo ?? null,
    upstreamRef: skill.upstreamRef ?? null,
    enabledAgents: skill.enabledAgents,
  };
}
