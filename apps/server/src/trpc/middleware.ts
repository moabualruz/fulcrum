/**
 * tRPC assertPermission middleware.
 *
 * setup step (this slice): validates that ctx.session is present.
 *   - Missing session → TRPCError code='UNAUTHORIZED'.
 *
 * setup step (Pillar 16 — gated `casbin-policies` flag): when the flag is ON,
 *   resolves CasbinEnforcerService + FulcrumCasbinAdapter from ctx.container
 *   and calls checkCasbinGate for the current request context.
 *   - Flag OFF: Better-Auth path unchanged.
 *   - Flag ON + allow rule in ctx.orgId: pass through.
 *   - Flag ON + deny in ctx.orgId (rule exists, enforce returns false): TRPCError FORBIDDEN.
 *   - Flag ON + no rule for subject in ctx.orgId: fall through to Better-Auth.
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

import { publicProcedure, t } from "./trpc.ts";
import type { TRPCContext } from "./context.ts";
import {
  LOCAL_DEV_PERMISSION_BYPASS_FLAG,
  permission,
  type TrpcProcedureMeta,
} from "./permissions.ts";
import { FlagRegistry } from "@feature-flags/application/registry.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";

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
  const segments = path.split(".").filter(Boolean);
  if (segments.length <= 1) return segments[0] ?? path;
  return segments.slice(0, -1).join(".");
}

function actionFromProcedurePath(path: string): string {
  const leaf = path.split(".").filter(Boolean).at(-1);
  if (!leaf) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Protected procedure '${path}' has no action leaf.`,
    });
  }
  return leaf;
}

function hasEnvFeature(flag: string): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((token) => token.trim())
    .includes(flag);
}

function permissionFromMetaOrPath(meta: TrpcProcedureMeta | undefined, path: string) {
  return meta?.permission ?? {
    resource: resourceFromProcedurePath(path),
    action: actionFromProcedurePath(path),
  };
}

// Process-level cached enforcer service (60s TTL).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cachedEnforcer: { svc: any; createdAt: number } | null = null;
const ENFORCER_TTL_MS = 60_000;

export function __resetCachedEnforcerForTest(): void {
  _cachedEnforcer = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCachedEnforcerService(AdapterCtor: any, EnforcerCtor: any, casbinRepo: any): any {
  const now = Date.now();
  if (_cachedEnforcer && now - _cachedEnforcer.createdAt < ENFORCER_TTL_MS) {
    return _cachedEnforcer.svc;
  }
  const adapter = new AdapterCtor(casbinRepo);
  const svc = new EnforcerCtor(adapter);
  _cachedEnforcer = { svc, createdAt: now };
  return svc;
}

/**
 * assertPermission middleware.
 *
 * setup step: session presence check only.
 * setup step: when `casbin-policies` flag is ON, calls checkCasbinGate() before
 *   passing through to Better-Auth. When flag is OFF: existing session-only check.
 */
export const assertPermission = t.middleware(async ({ ctx, next, path, meta }) => {
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

  // setup step: casbin-policies flag check (Pillar 16 — issue #16).
  // Dynamic imports keep casbin's @injectable() decorated classes out of the
  // web SSR bundle (Stage-3 decorators break Node.js ESM loader in web:build).
  // See web-bundle safety note in module JSDoc above.
  if (ctx.container) {
    const casbinOn = await isCasbinPoliciesEnabled(ctx);

    if (casbinOn) {
      try {
        const { resource, action } = permissionFromMetaOrPath(meta, path);

        // Dynamic imports — excluded from web SSR static bundle (decorator safety).
        const [{ FulcrumCasbinAdapter }, { CasbinEnforcerService, checkCasbinGate }, { CasbinRuleRepository }] =
          await Promise.all([
            import("@identity-access/application/permissions/casbin-adapter.ts"),
            import("@identity-access/application/permissions/enforcer.ts"),
            import("@platform-core/infrastructure/application-database/repositories/flags/CasbinRuleRepository.ts"),
          ]);

        const casbinRepo = ctx.container.get(CasbinRuleRepository);
        const enforcerSvc = getCachedEnforcerService(
          FulcrumCasbinAdapter,
          CasbinEnforcerService,
          casbinRepo,
        );

        try {
          await checkCasbinGate(
            enforcerSvc,
            ctx.orgId,
            ctx.userId,
            resource,
            action,
          );
        } catch (e) {
          const trpcError = e instanceof AppError ? appErrorToTrpcError(e) : e;
          if (
            trpcError instanceof TRPCError
            && trpcError.code === "FORBIDDEN"
            && hasEnvFeature(LOCAL_DEV_PERMISSION_BYPASS_FLAG)
          ) {
            console.warn(`permission bypass resource=${resource} action=${action} user=${ctx.userId} org=${ctx.orgId}`);
          } else {
            throw trpcError;
          }
        }
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
export const protectedProcedure = publicProcedure.use(assertPermission);

export function permissionedProcedure(input: { resource: string; action: string }) {
  return protectedProcedure.meta(permission(input.resource, input.action));
}
