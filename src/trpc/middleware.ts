/**
 * tRPC assertPermission middleware.
 *
 * Phase 1 (this slice): validates that ctx.session is present.
 *   - Missing session → TRPCError code='UNAUTHORIZED'.
 *
 * Phase 2 (Pillar 16 — gated `casbin-policies` flag): when the flag is ON,
 *   resolves CasbinEnforcerService + FulcrumCasbinAdapter from ctx.container
 *   and calls checkCasbinGate for the current request context.
 *   - Flag OFF: Better-Auth path unchanged.
 *   - Flag ON + allow rule: pass through.
 *   - Flag ON + deny (rule exists, enforce returns false): TRPCError FORBIDDEN.
 *   - Flag ON + no rule for subject: fall through to Better-Auth.
 *
 * Lint rule: every mutation procedure MUST use protectedProcedure (= t.procedure + this).
 * Enforced via middleware chain membership, not convention — procedures without the
 * middleware won't have ctx.session narrowed to non-null in TypeScript.
 *
 * Q-permissions: Better-Auth org plugin (owner/admin/member/guest) is the v1 baseline.
 * node-casbin ABAC is shipped + gated by FULCRUM_FEATURES=casbin-policies (C11).
 *
 * Web-bundle safety:
 *   The casbin adapter/enforcer classes use Stage-3 @injectable() decorators which
 *   Node.js cannot execute during SvelteKit SSR rendering. All casbin imports are
 *   dynamic (import()) so they are never statically bundled into the SSR output.
 *   FlagRegistry (decorator-free) is imported statically — it is safe.
 */

import { TRPCError } from "@trpc/server";

import { t } from "./trpc.ts";
import type { TRPCContext } from "./context.ts";
import { FlagRegistry } from "../flags/registry.ts";

/**
 * Resolved context when assertPermission passes.
 * session/orgId/userId are guaranteed non-null after this middleware.
 */
export interface AuthenticatedContext extends TRPCContext {
  session: NonNullable<TRPCContext["session"]>;
  orgId: string;
  userId: string;
}

async function isCasbinPoliciesEnabled(ctx: TRPCContext): Promise<boolean> {
  if (!ctx.container?.has(FlagRegistry)) return false;

  try {
    const flagRegistry = ctx.container.get(FlagRegistry);
    return await flagRegistry.isEnabled("casbin-policies", {
      orgId: ctx.orgId ?? undefined,
      userId: ctx.userId ?? undefined,
    });
  } catch {
    return false;
  }
}

function resourceFromProcedurePath(path: string): string {
  return path.split(".").filter(Boolean)[0] ?? path;
}

function actionFromProcedureType(type: "query" | "mutation" | "subscription"): string {
  if (type === "query") return "read";
  if (type === "mutation") return "write";
  return "subscribe";
}

/**
 * assertPermission middleware.
 *
 * Phase 1: session presence check only.
 * Phase 2: when `casbin-policies` flag is ON, calls checkCasbinGate() before
 *   passing through to Better-Auth. When flag is OFF: existing session-only check.
 */
export const assertPermission = t.middleware(async ({ ctx, next, path, type }) => {
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

  // Phase 2: casbin-policies flag check (Pillar 16 — issue #16).
  // Dynamic imports keep casbin's @injectable() decorated classes out of the
  // web SSR bundle (Stage-3 decorators break Node.js ESM loader in web:build).
  // See web-bundle safety note in module JSDoc above.
  if (ctx.container) {
    const casbinOn = await isCasbinPoliciesEnabled(ctx);

    if (casbinOn) {
      try {
        // Dynamic imports — excluded from web SSR static bundle (decorator safety).
        const [{ FulcrumCasbinAdapter }, { CasbinEnforcerService, checkCasbinGate }, { CasbinRuleRepository }] =
          await Promise.all([
            import("../permissions/casbin-adapter.ts"),
            import("../permissions/enforcer.ts"),
            import("../db/repositories/flags/CasbinRuleRepository.ts"),
          ]);

        const casbinRepo = ctx.container.get(CasbinRuleRepository);
        const adapter = new FulcrumCasbinAdapter(casbinRepo);
        const enforcerSvc = new CasbinEnforcerService(adapter);

        await checkCasbinGate(
          enforcerSvc,
          ctx.userId,
          resourceFromProcedurePath(path),
          actionFromProcedureType(type),
        );
      } catch (e) {
        // Re-throw TRPCErrors (FORBIDDEN from checkCasbinGate)
        if (e instanceof TRPCError) throw e;
        // Once Casbin is confirmed enabled, enforcement infrastructure failures
        // fail closed; adapter/container wiring must not silently downgrade routes.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Permission check failed.",
          cause: e,
        });
      }
    }
  }

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
