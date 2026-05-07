/**
 * orgs tRPC router — Pillar 9 (org management procedures).
 *
 * Procedures:
 *   - orgs.get()                     → Org row                  (permissionedProcedure)
 *   - orgs.update(name)              → { ok: true }             (permissionedProcedure, owner)
 *   - orgs.members.list()            → OrgMember[]              (permissionedProcedure, admin/owner)
 *   - orgs.members.updateRole(...)   → { ok: true }             (permissionedProcedure, owner)
 *   - orgs.members.remove(...)       → { ok: true }             (permissionedProcedure, owner/admin)
 *
 * C6: No raw SQL.
 * C7: Persistence and role checks live in application/orgs modules.
 */

import { TRPCError } from "@trpc/server";

import { t } from "@fulcrum/server/trpc/trpc.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import {
  UpdateOrgInputSchema,
  UpdateMemberRoleInputSchema,
  RemoveMemberInputSchema,
} from "@fulcrum/server/trpc/schemas/orgs.ts";
import { removeOrgMember, updateOrg, updateOrgMemberRole } from "@/application/orgs/commands.ts";
import { getOrg, listOrgMembers, type OrgAppContext } from "@/application/orgs/queries.ts";
import { appErrorToTrpcError } from "@/application/error-mapping.ts";
import { AppError } from "@/application/errors.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type CtxWithEm = {
  em: import("@mikro-orm/postgresql").EntityManager | null;
  orgId: string;
  userId: string;
};

function requireEm(em: import("@mikro-orm/postgresql").EntityManager | null) {
  if (!em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager not available in tRPC context.",
    });
  }
  return em;
}

function appContext(ctx: CtxWithEm): OrgAppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

async function mapAppError<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
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
  list: permissionedProcedure({ resource: "orgs", action: "list" }).query(async ({ ctx }) => {
    return mapAppError(() => listOrgMembers(requireEm(ctx["em"]), appContext(ctx as unknown as CtxWithEm)));
  }),

  /**
   * orgs.members.updateRole — change a member's role.
   * Owner only.
   */
  updateRole: permissionedProcedure({ resource: "orgs", action: "updateRole" })
    .input(UpdateMemberRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => updateOrgMemberRole(requireEm(ctx["em"]), appContext(ctx as unknown as CtxWithEm), input));
    }),

  /**
   * orgs.members.remove — remove a member.
   * Owner/admin only. Cannot remove self if last owner.
   */
  remove: permissionedProcedure({ resource: "orgs", action: "remove" })
    .input(RemoveMemberInputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => removeOrgMember(requireEm(ctx["em"]), appContext(ctx as unknown as CtxWithEm), input));
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// orgs router
// ─────────────────────────────────────────────────────────────────────────────

export const orgsRouter = t.router({
  /**
   * orgs.get — returns the current org.
   */
  get: permissionedProcedure({ resource: "orgs", action: "get" }).query(async ({ ctx }) => {
    return mapAppError(() => getOrg(requireEm(ctx["em"]), appContext(ctx as unknown as CtxWithEm)));
  }),

  /**
   * orgs.update — update org name.
   * Owner only.
   */
  update: permissionedProcedure({ resource: "orgs", action: "update" })
    .input(UpdateOrgInputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => updateOrg(requireEm(ctx["em"]), appContext(ctx as unknown as CtxWithEm), input));
    }),

  /** orgs.members sub-router */
  members: orgsMembersRouter,
});
