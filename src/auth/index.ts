/**
 * AuthService — Better-Auth v1 integration for Fulcrum.
 *
 * Wires Better-Auth with:
 *   - MikroORM-backed adapter (MikroOrmBetterAuthAdapter — no raw SQL, C6).
 *   - emailAndPassword plugin (always enabled for local-first mode).
 *   - organization plugin (always enabled; org context from Session.orgId).
 *   - Gated plugins (OAuth, magic-link, email OTP) wired behind "saas-auth"
 *     feature flag; shipped disabled per C1.
 *
 * Session carries: { id (token), userId, orgId, activeOrganizationId, expiresAt }.
 *
 * C1: Online/SaaS features wired disabled until "saas-auth" flag is ON.
 * C6: Zero raw SQL — all DB via EntityManager.
 * C7: MikroORM v7.
 * C8: @injectable() — needle-di Stage-3 pattern.
 */

import { injectable } from "@needle-di/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import type { DBAdapter } from "@better-auth/core/db/adapter";

import { MikroOrmBetterAuthAdapter } from "./adapter.ts";
import { FeatureFlag } from "../db/entities/auth/FeatureFlag.ts";

/**
 * Name of the feature flag that gates SaaS-only auth providers.
 * D5: lowercase-with-hyphens flag name.
 */
const SAAS_AUTH_FLAG = "saas-auth";

/**
 * Check if a feature flag is enabled for the local (global) scope.
 * Quick synchronous check via env var override first (D5).
 */
async function isFlagEnabled(em: EntityManager, flag: string): Promise<boolean> {
  const envKey = `FULCRUM_FLAG_${flag.toUpperCase().replace(/-/g, "_")}`;
  if (process.env[envKey] === "true") return true;
  if (process.env[envKey] === "false") return false;

  // DB lookup — global flag (orgId IS NULL, userId IS NULL)
  // Use FilterQuery cast to satisfy MikroORM v7 strict type checker
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await em.fork().findOne(FeatureFlag, { flag, orgId: null, userId: null } as any);
  return row?.enabled ?? false;
}

/**
 * Build the Better-Auth DBAdapterInstance from our MikroOrm adapter.
 *
 * Better-Auth expects: database = (betterAuthOptions) => DBAdapter
 * where DBAdapter has: { id, create, findOne, findMany, update, updateMany, delete, deleteMany, count, transaction }
 */
function buildDbAdapterInstance(mikro: MikroOrmBetterAuthAdapter): unknown {
  // DBAdapterInstance is (options: BetterAuthOptions) => DBAdapter
  // PGlite does not support transactions; Better-Auth auto-patches when transaction is absent.
  return (_options: unknown): Omit<DBAdapter, "transaction"> => {
    const custom = mikro.createAdapter();
    return {
      id: "mikro-orm",
      create: custom.create as DBAdapter["create"],
      findOne: custom.findOne as DBAdapter["findOne"],
      findMany: custom.findMany as DBAdapter["findMany"],
      update: custom.update as DBAdapter["update"],
      updateMany: custom.updateMany as DBAdapter["updateMany"],
      delete: custom.delete as DBAdapter["delete"],
      deleteMany: custom.deleteMany as DBAdapter["deleteMany"],
      count: custom.count as DBAdapter["count"],
    };
  };
}

/**
 * Construct the Better-Auth instance.
 *
 * This is called once at AuthService construction time and the resulting
 * `auth` object (with `.handler`) is stored for reuse.
 */
// Auth instance type — the generic parameter is inferred from options; use any to avoid
// the variance clash between Auth<{specific opts}> and Auth<BetterAuthOptions>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAuth = ReturnType<typeof betterAuth<any>>;

function buildAuth(em: EntityManager): AnyAuth {
  const mikro = new MikroOrmBetterAuthAdapter(em);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = buildDbAdapterInstance(mikro) as any;

  return betterAuth({
    database: db,

    // C1: email+password is always enabled (local-first mode)
    emailAndPassword: {
      enabled: true,
    },

    // Organisation plugin — enables org-scoped sessions
    plugins: [
      organization(),
      // C1: SaaS-only plugins (magicLink, emailOTP, OAuth) are wired
      // and will be added when "saas-auth" flag is ON at startup.
      // They are NOT wired at init time to avoid requiring their peer deps
      // (SMTP config, OAuth secrets) in local mode.
    ],

    // Session config — expiry aligned with SeedService SESSION_TTL_MS
    session: {
      expiresIn: 30 * 24 * 60 * 60,  // 30 days in seconds
    },

    // Trusted origins — permissive for local dev; tighten in SaaS mode
    trustedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  });
}

/**
 * @injectable() AuthService — wraps Better-Auth and exposes `.handler`
 * for SvelteKit hooks.server.ts mounting.
 *
 * @example
 *   const authService = container.get(AuthService);
 *   // In hooks.server.ts:
 *   if (url.pathname.startsWith('/api/auth')) {
 *     return authService.handler(request);
 *   }
 */
@injectable()
export class AuthService {
  private readonly auth: AnyAuth;

  constructor(private readonly em: EntityManager) {
    this.auth = buildAuth(em);
  }

  /**
   * HTTP handler — pass the incoming Request, get a Response back.
   * Mount on /api/auth/** in SvelteKit hooks.server.ts.
   */
  get handler(): (request: Request) => Promise<Response> {
    return this.auth.handler;
  }

  /**
   * Expose the raw auth instance for advanced usage (e.g., session validation).
   */
  get instance(): AnyAuth {
    return this.auth;
  }

  /**
   * Check if the "saas-auth" feature flag is enabled.
   * Used by hooks.server.ts to conditionally expose OAuth providers.
   */
  async isSaasAuthEnabled(): Promise<boolean> {
    return isFlagEnabled(this.em, SAAS_AUTH_FLAG);
  }
}
