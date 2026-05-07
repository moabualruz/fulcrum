/**
 * auth tRPC router — Pillar 9 (auth tRPC procedures + org management).
 *
 * Procedures:
 *   - auth.whoami        → { userId, orgId, email, role }       (permissionedProcedure)
 *   - auth.invite        → { invitationId, token }              (permissionedProcedure, admin/owner)
 *   - auth.acceptInvite  → { userId, orgId }                    (publicProcedure)
 *
 * Notes (from issue #09):
 *   - acceptInvite is publicProcedure — the invited user has no session yet.
 *   - Token stored HASHED in DB; plaintext returned only once at creation.
 *   - Token: crypto.randomBytes(32).toString('hex') → hashed with SHA-256.
 *   - Expiry default: 7 days.
 *
 * Web-bundle safety:
 *   All decorated classes resolved via dynamic import at call time — never as
 *   static value imports so SvelteKit SSR bundle stays clean.
 *
 * C6: No raw SQL.
 * C7: MikroORM v7 em.create / em.persistAndFlush / em.upsert / em.flush.
 * C8: Repositories resolved from ctx.container or ctx.em.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";

import { t } from "../../../trpc/trpc.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { publicProcedure } from "../../../trpc/trpc.ts";
import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import {
  acceptInvitation,
  createInvitation,
  requireAuthEntityManager,
  resolveApplicationSessionContext,
} from "../../../application/auth/session-context.ts";
import {
  InviteInputSchema,
  AcceptInviteInputSchema,
} from "../../../trpc/schemas/auth.ts";

const authApplication = {
  resolveApplicationSessionContext,
  createInvitation,
  acceptInvitation,
};

export function __setAuthApplicationForTest(overrides: Partial<typeof authApplication>): () => void {
  const previous = { ...authApplication };
  Object.assign(authApplication, overrides);
  return () => Object.assign(authApplication, previous);
}

function appContext(ctx: { orgId: string; userId: string; session: import("better-auth").Session }) {
  return { orgId: ctx.orgId, userId: ctx.userId, session: ctx.session };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// auth router
// ─────────────────────────────────────────────────────────────────────────────

export const authRouter = t.router({
  /**
   * auth.whoami — returns current user + org info from session.
   */
  whoami: permissionedProcedure({ resource: "auth", action: "whoami" }).query(async ({ ctx }) => {
    return mapAppError(() => authApplication.resolveApplicationSessionContext(ctx.em, appContext(ctx)));
  }),

  /**
   * auth.invite — create an Invitation row + return plaintext token.
   * Admin/owner only. Token stored HASHED; plaintext returned once.
   */
  invite: permissionedProcedure({ resource: "auth", action: "invite" })
    .input(InviteInputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        authApplication.createInvitation(requireAuthEntityManager(ctx.em), appContext(ctx), input)
      );
    }),

  /**
   * auth.acceptInvite — publicProcedure (no session required).
   * Validates plaintext token → creates/links user → creates OrgMember row.
   */
  acceptInvite: publicProcedure
    .input(AcceptInviteInputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        authApplication.acceptInvitation(requireAuthEntityManager(ctx.em as EntityManager | null), {
          token: input.token,
          ...(input.name === null || input.name === undefined ? {} : { name: input.name }),
        })
      );
    }),
});
