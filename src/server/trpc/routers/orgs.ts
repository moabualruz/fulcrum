/**
 * orgs tRPC router — Pillar 9 (org management procedures).
 *
 * Procedures:
 *   - orgs.get()                     → Org row                  (protectedProcedure)
 *   - orgs.update(name)              → { ok: true }             (protectedProcedure, owner)
 *   - orgs.members.list()            → OrgMember[]              (protectedProcedure, admin/owner)
 *   - orgs.members.updateRole(...)   → { ok: true }             (protectedProcedure, owner)
 *   - orgs.members.remove(...)       → { ok: true }             (protectedProcedure, owner/admin)
 *
 * C6: No raw SQL.
 * C7: MikroORM v7 em.findOne / em.find / em.flush / em.removeAndFlush.
 * C8: Repositories resolved from ctx.container or ctx.em.
 */

import { TRPCError } from "@trpc/server";

import { t } from "../../../trpc/trpc.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import {
  UpdateOrgInputSchema,
  UpdateMemberRoleInputSchema,
  RemoveMemberInputSchema,
} from "../../../trpc/schemas/orgs.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Lazy entity/repo loaders (web-bundle-safe)
// ─────────────────────────────────────────────────────────────────────────────

async function getOrgClass() {
  const { Org } = await import("../../../db/entities/auth/Org.ts");
  return Org;
}

async function getOrgMemberClass() {
  const { OrgMember } = await import("../../../db/entities/auth/OrgMember.ts");
  return OrgMember;
}

async function getOrgMemberRepository() {
  const { OrgMemberRepository } = await import(
    "../../../db/repositories/auth/OrgMemberRepository.ts"
  );
  return OrgMemberRepository;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type CtxWithEm = {
  em: import("@mikro-orm/postgresql").EntityManager | null;
  container: import("@needle-di/core").Container | null;
  orgId: string;
  userId: string;
};

async function requireEm(ctx: { em: import("@mikro-orm/postgresql").EntityManager | null }) {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager not available in tRPC context.",
    });
  }
  return ctx.em;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveRepo<T>(ctx: CtxWithEm, RepoClass: new (...args: any[]) => T): Promise<T | null> {
  if (ctx.container) {
    try {
      return ctx.container.get(RepoClass) as T;
    } catch {
      // fallthrough
    }
  }
  return null;
}

/** Assert caller is owner or admin. Throws FORBIDDEN otherwise. */
async function requireAdminOrOwner(ctx: CtxWithEm) {
  const em = await requireEm(ctx);
  const OrgMember = await getOrgMemberClass();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await em.findOne(OrgMember, {
    orgId: ctx.orgId,
    userId: ctx.userId,
  } as any);
  if (!membership || !["owner", "admin"].includes((membership as { role: string }).role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only org owners and admins can perform this action.",
    });
  }
  return membership as { role: string };
}

/** Assert caller is owner. Throws FORBIDDEN otherwise. */
async function requireOwner(ctx: CtxWithEm) {
  const em = await requireEm(ctx);
  const OrgMember = await getOrgMemberClass();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await em.findOne(OrgMember, {
    orgId: ctx.orgId,
    userId: ctx.userId,
  } as any);
  if (!membership || (membership as { role: string }).role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only org owners can perform this action.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// orgs.members sub-router
// ─────────────────────────────────────────────────────────────────────────────

const orgsMembersRouter = t.router({
  /**
   * orgs.members.list — list all OrgMember rows for ctx.orgId.
   * Admin/owner only.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireAdminOrOwner(ctx as unknown as CtxWithEm);
    const em = await requireEm(ctx);
    const OrgMember = await getOrgMemberClass();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members = await em.find(OrgMember, { orgId: ctx.orgId } as any);
    return (members as Array<{ id: string; userId: string; orgId: string; role: string; joinedAt: Date }>).map((m) => ({
      id: m.id,
      userId: m.userId,
      orgId: m.orgId,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }),

  /**
   * orgs.members.updateRole — change a member's role.
   * Owner only.
   */
  updateRole: protectedProcedure
    .input(UpdateMemberRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOwner(ctx as unknown as CtxWithEm);
      const em = await requireEm(ctx);
      const OrgMember = await getOrgMemberClass();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = await em.findOne(OrgMember, {
        orgId: ctx.orgId,
        userId: input.userId,
      } as any);
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User ${input.userId} is not a member of this org.`,
        });
      }
      (member as { role: string }).role = input.role;
      await em.flush();
      return { ok: true };
    }),

  /**
   * orgs.members.remove — remove a member.
   * Owner/admin only. Cannot remove self if last owner.
   */
  remove: protectedProcedure
    .input(RemoveMemberInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(ctx as unknown as CtxWithEm);
      const em = await requireEm(ctx);
      const OrgMember = await getOrgMemberClass();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = await em.findOne(OrgMember, {
        orgId: ctx.orgId,
        userId: input.userId,
      } as any);
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User ${input.userId} is not a member of this org.`,
        });
      }

      // Guard: cannot remove last owner
      if ((member as { role: string }).role === "owner") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ownerCount = await em.count(OrgMember, { orgId: ctx.orgId, role: "owner" } as any);
        if (ownerCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the last owner of an org.",
          });
        }
      }

      em.remove(member);
      await em.flush();
      return { ok: true };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// orgs router
// ─────────────────────────────────────────────────────────────────────────────

export const orgsRouter = t.router({
  /**
   * orgs.get — returns the current org.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const em = await requireEm(ctx);
    const Org = await getOrgClass();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const org = await em.findOne(Org, { id: ctx.orgId } as any);
    if (!org) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Org ${ctx.orgId} not found.`,
      });
    }
    const o = org as { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date };
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }),

  /**
   * orgs.update — update org name.
   * Owner only.
   */
  update: protectedProcedure
    .input(UpdateOrgInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireOwner(ctx as unknown as CtxWithEm);
      const em = await requireEm(ctx);
      const Org = await getOrgClass();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const org = await em.findOne(Org, { id: ctx.orgId } as any);
      if (!org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Org ${ctx.orgId} not found.`,
        });
      }
      (org as { name: string }).name = input.name;
      await em.flush();
      return { ok: true };
    }),

  /** orgs.members sub-router */
  members: orgsMembersRouter,
});
