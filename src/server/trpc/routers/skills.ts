import { z } from "zod";

import { FulcrumSkill } from "../../../db/entities/skills/index.ts";
import { resolveConflict } from "../../../skills/conflict-resolver.ts";
import {
  installSkill,
  listInstalledSkills,
  uninstallSkill,
} from "../../../skills/loader.ts";
import { syncUpstream, upgradeSkills } from "../../../skills/upstream-sync.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const SkillOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  source: z.string(),
  upstreamRepo: z.string().nullable(),
  upstreamRef: z.string().nullable(),
  enabledAgents: z.array(z.string()),
});

const InstallInputSchema = z.object({
  path: z.string().min(1),
});

const UpgradeInputSchema = z.object({
  slug: z.union([z.string().min(1), z.literal("all")]),
});

const UninstallInputSchema = z.object({
  slug: z.string().min(1),
});

const SyncInputSchema = z.object({
  fetchUpstream: z.boolean().default(false),
});

const SyncResultSchema = z.object({
  merged: z.array(z.string()),
  conflicts: z.array(z.string()),
  errors: z.array(z.string()),
});

const ResolveConflictInputSchema = z.object({
  slug: z.string().min(1),
  resolution: z.enum(["local", "upstream", "editor"]),
});

function serializeSkill(skill: FulcrumSkill): z.infer<typeof SkillOutputSchema> {
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

export const skillsRouter = t.router({
  list: protectedProcedure
    .output(z.array(SkillOutputSchema))
    .query(({ ctx }) => listInstalledSkills(ctx.orgId).then((skills) => skills.map(serializeSkill))),

  install: protectedProcedure
    .input(InstallInputSchema)
    .output(SkillOutputSchema)
    .mutation(({ ctx, input }) => installSkill(input.path, ctx.orgId).then(serializeSkill)),

  upgrade: protectedProcedure
    .input(UpgradeInputSchema)
    .output(z.array(SkillOutputSchema))
    .mutation(({ ctx, input }) =>
      upgradeSkills(ctx.orgId, input.slug).then((skills) => skills.map(serializeSkill))
    ),

  uninstall: protectedProcedure
    .input(UninstallInputSchema)
    .output(z.void())
    .mutation(({ ctx, input }) => uninstallSkill(input.slug, ctx.orgId)),

  sync: protectedProcedure
    .input(SyncInputSchema)
    .output(SyncResultSchema)
    .mutation(({ ctx, input }) => syncUpstream(ctx.orgId, input)),

  resolveConflict: protectedProcedure
    .input(ResolveConflictInputSchema)
    .output(SkillOutputSchema)
    .mutation(({ ctx, input }) =>
      resolveConflict(input.slug, input.resolution, ctx.orgId).then(serializeSkill)
    ),
});
