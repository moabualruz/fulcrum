/**
 * flags tRPC router — feature-flag registry procedures.
 *
 * Procedures:
 *   - flags.list()     → { name, enabled, description }[]  (protectedProcedure)
 *   - flags.set(input) → { ok: boolean }                    (owner/admin only)
 *
 * Authorization:
 *   - flags.list: any authenticated user.
 *   - flags.set:  owner or admin role in OrgMember — FORBIDDEN otherwise.
 *
 * Issue #07 acceptance criteria:
 *   - flags.list returns all 16 registered flags with enabled state.
 *   - flags.set upserts a FeatureFlag row and returns { ok: true }.
 *   - Non-owner calling flags.set → TRPCError code='FORBIDDEN'.
 *
 * Web-bundle safety:
 *   MikroORM entity classes and *Repository classes use Stage-3 decorators
 *   (@Entity, @injectable, etc.) which Node.js cannot execute during SvelteKit
 *   SSR rendering. To keep this file web-bundle-safe, all decorated classes are
 *   resolved at runtime via ctx.em (string-based entity name lookup) or
 *   ctx.container — never statically imported as values.
 *
 * C6: No raw SQL.
 * C7: MikroORM v7 em.findOne / em.create / em.flush (C6/C7 safe).
 * C8: FlagRegistry + repositories resolved from ctx.container or ctx.em.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { t } from "../../../trpc/trpc.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import {
  FlagRegistry,
  FEATURE_FLAGS,
  FLAG_DESCRIPTIONS,
  type FeatureFlagName,
} from "../.././../flags/registry.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────────

const flagNameSchema = z.enum(FEATURE_FLAGS);

// ─────────────────────────────────────────────────────────────────────────────
// Output type
// ─────────────────────────────────────────────────────────────────────────────

interface FlagListItem {
  name: FeatureFlagName;
  enabled: boolean;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime-only entity + repo resolution
// All decorated classes are imported lazily at procedure call time so they
// never appear as static imports in the SSR bundle.
// ─────────────────────────────────────────────────────────────────────────────

async function getFeatureFlagClass() {
  const { FeatureFlag } = await import(
    "../../../db/entities/auth/FeatureFlag.ts"
  );
  return FeatureFlag;
}

async function getFeatureFlagRepository() {
  const { FeatureFlagRepository } = await import(
    "../../../db/repositories/auth/FeatureFlagRepository.ts"
  );
  return FeatureFlagRepository;
}

async function getOrgMemberRepository() {
  const { OrgMemberRepository } = await import(
    "../../../db/repositories/auth/OrgMemberRepository.ts"
  );
  return OrgMemberRepository;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve FlagRegistry from ctx
// ─────────────────────────────────────────────────────────────────────────────

async function resolveFlagRegistry(ctx: {
  container: import("@needle-di/core").Container | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
}): Promise<FlagRegistry> {
  if (ctx.container) {
    try {
      return ctx.container.get(FlagRegistry);
    } catch {
      // fallback: build from raw repo
    }
  }
  if (ctx.em) {
    const FeatureFlagRepository = await getFeatureFlagRepository();
    const FeatureFlag = await getFeatureFlagClass();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = ctx.em.getRepository(FeatureFlag) as any;
    return new FlagRegistry(repo as InstanceType<typeof FeatureFlagRepository>);
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "FlagRegistry could not be resolved — neither container nor em available.",
  });
}

async function resolveOrgMemberRepo(ctx: {
  container: import("@needle-di/core").Container | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any | null> {
  if (ctx.container) {
    const OrgMemberRepository = await getOrgMemberRepository();
    try {
      return ctx.container.get(OrgMemberRepository);
    } catch {
      return null;
    }
  }
  return null;
}

async function findOrgMembership(
  ctx: {
    container: import("@needle-di/core").Container | null;
    em: import("@mikro-orm/postgresql").EntityManager | null;
  },
  orgId: string,
  userId: string,
): Promise<{ role: string } | null> {
  const orgMemberRepo = await resolveOrgMemberRepo(ctx);
  if (orgMemberRepo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return orgMemberRepo.findOne({ orgId, userId } as any);
  }

  if (ctx.em) {
    const { OrgMember } = await import("../../../db/entities/auth/OrgMember.ts");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ctx.em.findOne(OrgMember, { orgId, userId } as any);
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "OrgMember repository could not be resolved.",
  });
}

async function requireOwnerOrAdmin(ctx: {
  container: import("@needle-di/core").Container | null;
  em: import("@mikro-orm/postgresql").EntityManager | null;
  orgId: string | null;
  userId: string | null;
}): Promise<void> {
  if (!ctx.orgId || !ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session is missing orgId or userId. Re-authenticate.",
    });
  }

  const membership = await findOrgMembership(ctx, ctx.orgId, ctx.userId);

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only org owners and admins can modify feature flags.",
    });
  }
}

async function requireWritableFlagScope(
  ctx: {
    container: import("@needle-di/core").Container | null;
    em: import("@mikro-orm/postgresql").EntityManager | null;
    orgId: string | null;
  },
  input: { orgId?: string; userId?: string },
): Promise<string> {
  if (!ctx.orgId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session is missing orgId. Re-authenticate.",
    });
  }

  if (input.orgId && input.orgId !== ctx.orgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot modify feature flags outside the active org.",
    });
  }

  if (input.userId) {
    const targetMembership = await findOrgMembership(ctx, ctx.orgId, input.userId);
    if (!targetMembership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot modify feature flags for users outside the active org.",
      });
    }
  }

  return ctx.orgId;
}

// ─────────────────────────────────────────────────────────────────────────────
// flags router
// ─────────────────────────────────────────────────────────────────────────────

export const flagsRouter = t.router({
  /**
   * flags.list — returns all registered flags with current enabled state.
   * Reads from FlagRegistry (env + DB, 60s TTL cache).
   * Any authenticated user may call this.
   */
  list: protectedProcedure.query(async ({ ctx }): Promise<FlagListItem[]> => {
    const registry = await resolveFlagRegistry(ctx);
    const { orgId, userId } = ctx;

    const items = await Promise.all(
      FEATURE_FLAGS.map(async (flag) => ({
        name: flag,
        enabled: await registry.isEnabled(flag, {
          orgId: orgId ?? undefined,
          userId: userId ?? undefined,
        }),
        description: FLAG_DESCRIPTIONS[flag],
      })),
    );

    return items;
  }),

  /**
   * flags.set — upsert a FeatureFlag row; bust the registry cache.
   * Owner/admin only — FORBIDDEN for other roles.
   */
  set: protectedProcedure
    .input(
      z.object({
        flag: flagNameSchema,
        enabled: z.boolean(),
        /** Optional org scope. Defaults to ctx.orgId (current org). */
        orgId: z.string().uuid().optional(),
        /** Optional user scope. Null = org-level flag. */
        userId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => {
      // ── Authorization: owner or admin only ───────────────────────────────
      await requireOwnerOrAdmin(ctx);
      const targetOrgId = await requireWritableFlagScope(ctx, input);

      // ── Upsert FeatureFlag row ────────────────────────────────────────────
      if (!ctx.em) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "EntityManager not available in tRPC context.",
        });
      }

      const FeatureFlag = await getFeatureFlagClass();
      const scopedOrgId = targetOrgId;
      const scopedUserId = input.userId ?? null;

      // Find existing row matching the unique key (orgId, userId, flag).
      // em.upsert with nullable unique keys is unreliable; use find + create/assign instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await ctx.em.findOne(FeatureFlag, {
        flag: input.flag,
        orgId: scopedOrgId,
        userId: scopedUserId,
      } as any);

      if (existing) {
        (existing as { enabled: boolean }).enabled = input.enabled;
        await ctx.em.flush();
      } else {
        const row = ctx.em.create(FeatureFlag, {
          flag: input.flag,
          enabled: input.enabled,
          orgId: scopedOrgId ?? undefined,
          userId: scopedUserId ?? undefined,
          createdAt: new Date(),
        } as any);
        ctx.em.persist(row);
        await ctx.em.flush();
      }

      // ── Bust cache ────────────────────────────────────────────────────────
      const registry = await resolveFlagRegistry(ctx);
      registry.bustFlag(input.flag as FeatureFlagName);

      return { ok: true };
    }),
});
