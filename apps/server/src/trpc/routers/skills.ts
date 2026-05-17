import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  installFulcrumSkill,
  overrideSkillConflict,
  overrideSkillLock,
  resolveFulcrumSkillConflict,
  syncFulcrumSkills,
  uninstallFulcrumSkill,
  upgradeFulcrumSkills,
} from "@platform-core/application/skills/commands.ts";
import {
  listRegistrySkills,
  listSkillConflicts,
  listSkills,
} from "@platform-core/application/skills/queries.ts";
import {
  SkillConflictOutputSchema,
  SkillOutputSchema,
  SkillRegistryEntrySchema,
} from "@platform-core/domain/skills.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

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

const RegistryListInputSchema = z.object({
  orgId: z.string().optional(),
}).optional();

const ConflictOverrideInputSchema = z.object({
  conflictId: z.string().min(1),
  auditNote: z.string().min(1),
  resolution: z.enum(["local", "upstream"]).default("upstream"),
});

const LockOverrideInputSchema = z.object({
  slug: z.string().min(1),
  expectedSha256: z.string().min(1),
  actualSha256: z.string().min(1),
  auditNote: z.string().optional(),
});

type EntityManager = import("typeorm").EntityManager;

function appContext(ctx: { orgId: string }): { orgId: string } {
  return { orgId: ctx.orgId };
}

function requireEntityManager(ctx: Record<string, unknown>, message: string): EntityManager {
  const em = ctx["em"] as EntityManager | null | undefined;
  if (em) return em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

export const skillsRouter = t.router({
  list: permissionedProcedure({ resource: "fulcrum_skills", action: "list" })
    .output(z.array(SkillOutputSchema))
    .query(({ ctx }) => listSkills(appContext(ctx))),

  install: permissionedProcedure({ resource: "fulcrum_skills", action: "install" })
    .input(InstallInputSchema)
    .output(SkillOutputSchema)
    .mutation(({ ctx, input }) => installFulcrumSkill(appContext(ctx), input.path)),

  upgrade: permissionedProcedure({ resource: "fulcrum_skills", action: "upgrade" })
    .input(UpgradeInputSchema)
    .output(z.array(SkillOutputSchema))
    .mutation(({ ctx, input }) => upgradeFulcrumSkills(appContext(ctx), input.slug)),

  uninstall: permissionedProcedure({ resource: "fulcrum_skills", action: "uninstall" })
    .input(UninstallInputSchema)
    .output(z.void())
    .mutation(({ ctx, input }) => uninstallFulcrumSkill(appContext(ctx), input.slug)),

  sync: permissionedProcedure({ resource: "fulcrum_skills", action: "sync" })
    .input(SyncInputSchema)
    .output(SyncResultSchema)
    .mutation(({ ctx, input }) => syncFulcrumSkills(appContext(ctx), input)),

  resolveConflict: permissionedProcedure({ resource: "fulcrum_skills", action: "resolveConflict" })
    .input(ResolveConflictInputSchema)
    .output(SkillOutputSchema)
    .mutation(({ ctx, input }) => resolveFulcrumSkillConflict(appContext(ctx), input.slug, input.resolution)),

  // ── Registry procedures (D-17, D-20) ─────────────────────────────────

  registry: t.router({
    list: permissionedProcedure({ resource: "fulcrum_skills", action: "list" })
      .input(RegistryListInputSchema)
      .output(z.array(SkillRegistryEntrySchema))
      .query(async ({ ctx }) => {
        return listRegistrySkills((ctx as Record<string, unknown>)["em"] as EntityManager | null, appContext(ctx));
      }),
  }),

  // ── Conflict procedures (D-23, D-24) ──────────────────────────────────

  conflicts: t.router({
    list: permissionedProcedure({ resource: "fulcrum_skills", action: "list" })
      .output(z.array(SkillConflictOutputSchema))
      .query(async ({ ctx }) => {
        return listSkillConflicts(requireEntityManager(
          ctx,
          "EntityManager could not be resolved for fulcrum_skills.conflicts.list.",
        ));
      }),

    override: permissionedProcedure({ resource: "fulcrum_skills", action: "update" })
      .input(ConflictOverrideInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        return overrideSkillConflict(
          requireEntityManager(ctx, "EntityManager could not be resolved for fulcrum_skills.conflicts.override."),
          appContext(ctx),
          input,
        );
      }),
  }),

  // ── Lock override procedures (D-21, D-24) ─────────────────────────────

  lock: t.router({
    override: permissionedProcedure({ resource: "fulcrum_skills", action: "update" })
      .input(LockOverrideInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        return overrideSkillLock((ctx as Record<string, unknown>)["em"] as EntityManager | null, appContext(ctx), input);
      }),
  }),
});
