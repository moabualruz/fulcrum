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
import { organization, magicLink, emailOTP } from "better-auth/plugins";
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
 * Called once at AuthService.init() time; the resulting `auth` object
 * (with `.handler`) is stored for reuse.
 *
 * C1: saas-auth flag gates OAuth / magic-link / email-OTP plugins.
 *     When flag is OFF only emailAndPassword + organization are active.
 *     When flag is ON all four gated plugins are also included.
 *     The WIRING ships now — just disabled by default.
 */
// Auth instance type — the generic parameter is inferred from options; use any to avoid
// the variance clash between Auth<{specific opts}> and Auth<BetterAuthOptions>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAuth = ReturnType<typeof betterAuth<any>>;

async function buildAuth(em: EntityManager): Promise<AnyAuth> {
  const mikro = new MikroOrmBetterAuthAdapter(em);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = buildDbAdapterInstance(mikro) as any;

  const saasEnabled = await isFlagEnabled(em, SAAS_AUTH_FLAG);

  // Base plugins — always enabled (local-first mode)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [organization()];

  if (saasEnabled) {
    // C1: SaaS-only plugins wired when "saas-auth" flag is ON.
    // sendMagicLink / sendVerificationOTP are no-ops stubs — real SMTP config
    // is provided by the SaaS deployment environment (not shipped here).
    plugins.push(
      magicLink({
        sendMagicLink: async (_data) => {
          // Stub: real implementation provided by SMTP transport in SaaS mode.
          // Better-Auth requires this callback to be present when plugin is active.
        },
      }),
      emailOTP({
        sendVerificationOTP: async (_data) => {
          // Stub: real implementation provided by SMTP transport in SaaS mode.
        },
      }),
    );
  }

  return betterAuth({
    database: db,

    // C1: email+password is always enabled (local-first mode)
    emailAndPassword: {
      enabled: true,
    },

    // Social providers — gated by saas-auth flag.
    // clientId/clientSecret are read from environment at runtime; absent in local mode.
    ...(saasEnabled && {
      socialProviders: {
        google: {
          clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
          clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
        },
        github: {
          clientId: process.env["GITHUB_CLIENT_ID"] ?? "",
          clientSecret: process.env["GITHUB_CLIENT_SECRET"] ?? "",
        },
      },
    }),

    plugins,

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
 * Lifecycle: construct → await init() → use handler / instance.
 * `init()` resolves the saas-auth flag and builds the Better-Auth instance.
 * In tests, pass `em` directly to constructor and call `await authService.init()`.
 *
 * @example
 *   const authService = new AuthService(em);
 *   await authService.init();
 *   // In hooks.server.ts:
 *   if (url.pathname.startsWith('/api/auth')) {
 *     return authService.handler(request);
 *   }
 */
@injectable()
export class AuthService {
  private auth: AnyAuth | null = null;

  constructor(private readonly em: EntityManager) {}

  /**
   * Async init — resolves feature flag + builds Better-Auth instance.
   * Must be called once before using `handler` or `instance`.
   * Safe to call multiple times — rebuilds on each call (flag may change).
   */
  async init(): Promise<void> {
    this.auth = await buildAuth(this.em);
  }

  /**
   * HTTP handler — pass the incoming Request, get a Response back.
   * Mount on /api/auth/** in SvelteKit hooks.server.ts.
   * Throws if `init()` has not been called.
   */
  get handler(): (request: Request) => Promise<Response> {
    if (!this.auth) {
      throw new Error("[AuthService] call init() before using handler");
    }
    return this.auth.handler;
  }

  /**
   * Expose the raw auth instance for advanced usage (e.g., session validation).
   * Throws if `init()` has not been called.
   */
  get instance(): AnyAuth {
    if (!this.auth) {
      throw new Error("[AuthService] call init() before using instance");
    }
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
