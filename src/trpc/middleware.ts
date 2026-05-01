/**
 * tRPC assertPermission middleware.
 *
 * Phase 1 (this slice): validates that ctx.session is present.
 *   - Missing session → TRPCError code='UNAUTHORIZED'.
 *
 * Phase 2 (Pillar 16 — gated `casbin-policies` flag): extends this middleware
 *   to call node-casbin for ABAC policy enforcement. The flag check goes here;
 *   callers don't change.
 *
 * Lint rule: every mutation procedure MUST use protectedProcedure (= t.procedure + this).
 * Enforced via middleware chain membership, not convention — procedures without the
 * middleware won't have ctx.session narrowed to non-null in TypeScript.
 *
 * Q-permissions: Better-Auth org plugin (owner/admin/member/guest) is the v1 baseline.
 * node-casbin ABAC is shipped + gated by FULCRUM_FEATURES=casbin-policies (C11).
 */

import { TRPCError } from "@trpc/server";

import { t } from "./trpc.ts";
import type { TRPCContext } from "./context.ts";

/**
 * Resolved context when assertPermission passes.
 * session/orgId/userId are guaranteed non-null after this middleware.
 */
export interface AuthenticatedContext extends TRPCContext {
  session: NonNullable<TRPCContext["session"]>;
  orgId: string;
  userId: string;
}

/**
 * assertPermission middleware.
 *
 * Phase 1: session presence check only.
 * Phase 2 stub: when `FULCRUM_FEATURES` includes `casbin-policies`, delegate to
 *   FulcrumCasbinAdapter.enforce(orgId, userId, resource, action) — wired in Pillar 16.
 */
export const assertPermission = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required. No valid session found.",
    });
  }

  if (!ctx.orgId || !ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session is missing orgId or userId. Re-authenticate.",
    });
  }

  // Phase 2 hook: casbin-policies flag check
  // When FULCRUM_FEATURES=casbin-policies is on AND a `permission` input key is present,
  // Pillar 16 will extend this via a composed middleware. This slot is intentionally
  // left as a passthrough for now (C11: CasbinRule shipped but gated).

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      orgId: ctx.orgId,
      userId: ctx.userId,
    } satisfies AuthenticatedContext,
  });
});

/**
 * protectedProcedure builder — ALL mutation procedures MUST use this.
 * Also use for queries that require an authenticated caller.
 * Only use publicProcedure for genuinely unauthenticated endpoints.
 */
export const protectedProcedure = t.procedure.use(assertPermission);
