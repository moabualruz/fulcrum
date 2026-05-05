import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { FulcrumSkill } from "../../../db/entities/skills/index.ts";
import { SkillConflict, SkillConflictKind, SkillConflictStatus } from "../../../db/entities/skills/SkillConflict.ts";
import { resolveConflict } from "../../../skills/conflict-resolver.ts";
import {
  installSkill,
  listInstalledSkills,
  uninstallSkill,
} from "../../../skills/loader.ts";
import { syncUpstream, upgradeSkills } from "../../../skills/upstream-sync.ts";
import { SkillRegistryService } from "../../../skills/registry-service.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
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

const SkillRegistryEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  source: z.enum(["local", "upstream", "mcp"]),
  version: z.string().nullable(),
  enabledAgents: z.array(z.string()),
});

const SkillConflictOutputSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: z.nativeEnum(SkillConflictKind),
  status: z.nativeEnum(SkillConflictStatus),
  localHash: z.string().nullable().optional(),
  upstreamHash: z.string().nullable().optional(),
  baseHash: z.string().nullable().optional(),
  expectedSha256: z.string().nullable().optional(),
  actualSha256: z.string().nullable().optional(),
  suggestedResolution: z.string().nullable().optional(),
  auditNote: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
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
  list: permissionedProcedure({ resource: "fulcrum_skills", action: "list" })
    .output(z.array(SkillOutputSchema))
    .query(({ ctx }) => listInstalledSkills(ctx.orgId).then((skills) => skills.map(serializeSkill))),

  install: permissionedProcedure({ resource: "fulcrum_skills", action: "install" })
    .input(InstallInputSchema)
    .output(SkillOutputSchema)
    .mutation(({ ctx, input }) => installSkill(input.path, ctx.orgId).then(serializeSkill)),

  upgrade: permissionedProcedure({ resource: "fulcrum_skills", action: "upgrade" })
    .input(UpgradeInputSchema)
    .output(z.array(SkillOutputSchema))
    .mutation(({ ctx, input }) =>
      upgradeSkills(ctx.orgId, input.slug).then((skills) => skills.map(serializeSkill))
    ),

  uninstall: permissionedProcedure({ resource: "fulcrum_skills", action: "uninstall" })
    .input(UninstallInputSchema)
    .output(z.void())
    .mutation(({ ctx, input }) => uninstallSkill(input.slug, ctx.orgId)),

  sync: permissionedProcedure({ resource: "fulcrum_skills", action: "sync" })
    .input(SyncInputSchema)
    .output(SyncResultSchema)
    .mutation(({ ctx, input }) => syncUpstream(ctx.orgId, input)),

  resolveConflict: permissionedProcedure({ resource: "fulcrum_skills", action: "resolveConflict" })
    .input(ResolveConflictInputSchema)
    .output(SkillOutputSchema)
    .mutation(({ ctx, input }) =>
      resolveConflict(input.slug, input.resolution, ctx.orgId).then(serializeSkill)
    ),

  // ── Registry procedures (D-17, D-20) ─────────────────────────────────
  // Uses ctx.em from the tRPC context to avoid creating separate ORM connections.

  registry: t.router({
    list: permissionedProcedure({ resource: "fulcrum_skills", action: "list" })
      .input(RegistryListInputSchema)
      .output(z.array(SkillRegistryEntrySchema))
      .query(async ({ ctx }) => {
        const em = ctx.em;
        if (!em) {
          // Fallback to SkillRegistryService standalone when no context EM
          return SkillRegistryService.list(ctx.orgId);
        }
        const skills = await em.find(
          FulcrumSkill,
          { org: ctx.orgId },
          { orderBy: { slug: "ASC" } },
        );
        return skills.map((skill) => {
          const source = skill.source === "upstream"
            ? "upstream" as const
            : "local" as const;
          return {
            slug: skill.slug,
            name: skill.name,
            source,
            version: null,
            enabledAgents: skill.enabledAgents,
          };
        });
      }),
  }),

  // ── Conflict procedures (D-23, D-24) ──────────────────────────────────

  conflicts: t.router({
    list: permissionedProcedure({ resource: "fulcrum_skills", action: "list" })
      .output(z.array(SkillConflictOutputSchema))
      .query(async ({ ctx }) => {
        if (!ctx.em) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "EntityManager could not be resolved for fulcrum_skills.conflicts.list.",
          });
        }
        const em = ctx.em.fork();
        const conflicts = await em.find(SkillConflict, {}, {
          orderBy: { createdAt: "DESC" },
        });
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
      }),

    override: permissionedProcedure({ resource: "fulcrum_skills", action: "update" })
      .input(ConflictOverrideInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.em) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "EntityManager could not be resolved for fulcrum_skills.conflicts.override.",
          });
        }
        const em = ctx.em.fork();
        const conflict = await em.findOne(SkillConflict, { id: input.conflictId });
        if (!conflict) {
          throw new Error(`Conflict ${input.conflictId} not found`);
        }

        conflict.status = SkillConflictStatus.Overridden;
        conflict.auditNote = input.auditNote;

        // If resolution is upstream, auto-resolve the underlying skill conflict
        if (input.resolution === "upstream" && conflict.slug) {
          try {
            await resolveConflict(conflict.slug, "upstream", ctx.orgId);
            conflict.status = SkillConflictStatus.Resolved;
          } catch {
            // Resolution may fail if upstream repo isn't accessible —
            // still mark as Overridden with audit note
          }
        }

        await em.flush();
        return { ok: true as const };
      }),
  }),

  // ── Lock override procedures (D-21, D-24) ─────────────────────────────

  lock: t.router({
    override: permissionedProcedure({ resource: "fulcrum_skills", action: "update" })
      .input(LockOverrideInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        const { readSkillsLockFile, writeSkillsLockFile } = await import("../../../skills/lock.ts");
        const lock = await readSkillsLockFile();

        // Update the lock entry with the override hash
        if (lock[input.slug]) {
          const existing = lock[input.slug] ?? { version: "0.0.0", hash: "", installedAt: new Date().toISOString(), enabled_agents: [] };
          lock[input.slug] = {
            version: existing.version,
            hash: input.actualSha256,
            installedAt: new Date().toISOString(),
            enabled_agents: existing.enabled_agents,
          };
        } else {
          lock[input.slug] = {
            version: "0.0.0",
            hash: input.actualSha256,
            installedAt: new Date().toISOString(),
            enabled_agents: [],
          };
        }

        await writeSkillsLockFile(lock);

        // Audit event via Event entity (best-effort)
        if (ctx.em) {
          try {
            const auditEm = ctx.em.fork();
            const { Org } = await import("../../../db/entities/auth/Org.ts");
            const { Event } = await import("../../../db/entities/core/Event.ts");
            const { EventRepository } = await import("../../../db/repositories/core/EventRepository.ts");
            const org = await auditEm.findOne(Org, { id: ctx.orgId });
            if (org) {
              const event = auditEm.create(Event, {
                org,
                verb: "lock_override",
                subjectId: `${input.slug}:${input.expectedSha256}→${input.actualSha256}`,
                metadata: {
                  slug: input.slug,
                  expectedSha256: input.expectedSha256,
                  actualSha256: input.actualSha256,
                  auditNote: input.auditNote ?? null,
                },
              } as never);
              await auditEm.flush();
            }
          } catch {
            // Audit is best-effort
          }
        }

        return { ok: true as const };
      }),
  }),
});
