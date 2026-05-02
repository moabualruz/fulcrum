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

import { createHash } from "node:crypto";
import { injectable } from "@needle-di/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { betterAuth } from "better-auth";
import { organization, magicLink, emailOTP } from "better-auth/plugins";
import type { DBAdapter } from "@better-auth/core/db/adapter";

import { MikroOrmBetterAuthAdapter } from "./adapter.ts";
import { FeatureFlag } from "../db/entities/auth/FeatureFlag.ts";
import { DEFAULT_ADMIN_EMAIL } from "../db/seed.ts";

/**
 * Name of the feature flag that gates SaaS-only auth providers.
 * D5: lowercase-with-hyphens flag name.
 */
const SAAS_AUTH_FLAG = "saas-auth";
const DEV_TEST_AUTH_SECRET = "fulcrum-dev-test-better-auth-secret-00000000";
const DEV_TEST_TRUSTED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];
const BETTER_AUTH_LOCAL_ADMIN_EMAIL = "admin@local.fulcrum";

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

function nonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isProductionRuntime(): boolean {
  return process.env["NODE_ENV"] === "production";
}

function betterAuthSecret(): string {
  const secret = nonEmptyEnv("BETTER_AUTH_SECRET");
  if (secret) return secret;

  if (isProductionRuntime()) {
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  }

  return DEV_TEST_AUTH_SECRET;
}

function parseCommaList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function trustedOrigins(): string[] {
  const configured = parseCommaList(nonEmptyEnv("FULCRUM_TRUSTED_ORIGINS"));
  if (configured.length > 0) return configured;
  return isProductionRuntime() ? [] : DEV_TEST_TRUSTED_ORIGINS;
}

function sha256Digest(value: string | null): string | null {
  if (value === null) return null;
  return createHash("sha256").update(value).digest("hex");
}

function oauthProviderConfig(): Record<string, { clientId: string; clientSecret: string }> | undefined {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  const googleId = nonEmptyEnv("GOOGLE_CLIENT_ID");
  const googleSecret = nonEmptyEnv("GOOGLE_CLIENT_SECRET");
  if (googleId && googleSecret) {
    providers["google"] = { clientId: googleId, clientSecret: googleSecret };
  }

  const githubId = nonEmptyEnv("GITHUB_CLIENT_ID");
  const githubSecret = nonEmptyEnv("GITHUB_CLIENT_SECRET");
  if (githubId && githubSecret) {
    providers["github"] = { clientId: githubId, clientSecret: githubSecret };
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
}

async function normalizeLocalSignInRequest(request: Request): Promise<Request> {
  if (request.method !== "POST") return request;

  const url = new URL(request.url);
  if (!url.pathname.endsWith("/sign-in/email")) return request;

  const headers = new Headers(request.headers);
  const contentType = headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== "object" || !("email" in body)) return request;
    if (String((body as { email: unknown }).email).toLowerCase() !== DEFAULT_ADMIN_EMAIL) return request;

    headers.delete("content-length");
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify({ ...body, email: BETTER_AUTH_LOCAL_ADMIN_EMAIL }),
    });
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await request.clone().text());
    if (form.get("email")?.toLowerCase() !== DEFAULT_ADMIN_EMAIL) return request;

    form.set("email", BETTER_AUTH_LOCAL_ADMIN_EMAIL);
    headers.delete("content-length");
    return new Request(request.url, {
      method: request.method,
      headers,
      body: form.toString(),
    });
  }

  return request;
}

async function authConfigSignature(em: EntityManager): Promise<string> {
  const saasEnabled = await isFlagEnabled(em, SAAS_AUTH_FLAG);
  return JSON.stringify({
    saasEnabled,
    production: isProductionRuntime(),
    secret: sha256Digest(nonEmptyEnv("BETTER_AUTH_SECRET")),
    trustedOrigins: trustedOrigins(),
    google: {
      clientId: sha256Digest(nonEmptyEnv("GOOGLE_CLIENT_ID")),
      clientSecret: sha256Digest(nonEmptyEnv("GOOGLE_CLIENT_SECRET")),
    },
    github: {
      clientId: sha256Digest(nonEmptyEnv("GITHUB_CLIENT_ID")),
      clientSecret: sha256Digest(nonEmptyEnv("GITHUB_CLIENT_SECRET")),
    },
  });
}

async function buildAuth(em: EntityManager): Promise<{ auth: AnyAuth; signature: string }> {
  const mikro = new MikroOrmBetterAuthAdapter(em);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = buildDbAdapterInstance(mikro) as any;

  const saasEnabled = await isFlagEnabled(em, SAAS_AUTH_FLAG);
  const socialProviders = saasEnabled ? oauthProviderConfig() : undefined;
  const secret = betterAuthSecret();

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

  const auth = betterAuth({
    database: db,
    secret,

    // C1: email+password is always enabled (local-first mode)
    emailAndPassword: {
      enabled: true,
      disableSignUp: !saasEnabled,
    },

    // Social providers — gated by saas-auth flag.
    // clientId/clientSecret are read from environment at runtime; absent in local mode.
    ...(socialProviders && {
      socialProviders,
    }),

    plugins,

    // Session config — expiry aligned with SeedService SESSION_TTL_MS
    session: {
      expiresIn: 30 * 24 * 60 * 60,  // 30 days in seconds
    },

    trustedOrigins: trustedOrigins(),
  });

  return { auth, signature: await authConfigSignature(em) };
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
  private authSignature: string | null = null;

  constructor(private readonly em: EntityManager) {}

  /**
   * Async init — resolves feature flag + builds Better-Auth instance.
   * Must be called once before using `handler` or `instance`.
   * Safe to call multiple times — rebuilds on each call (flag may change).
   */
  async init(): Promise<void> {
    const built = await buildAuth(this.em);
    this.auth = built.auth;
    this.authSignature = built.signature;
  }

  private async ensureFreshAuth(): Promise<AnyAuth> {
    if (!this.auth) {
      await this.init();
      if (!this.auth) {
        throw new Error("[AuthService] failed to initialise auth");
      }
      return this.auth;
    }

    const currentSignature = await authConfigSignature(this.em);
    if (currentSignature !== this.authSignature) {
      const built = await buildAuth(this.em);
      this.auth = built.auth;
      this.authSignature = built.signature;
    }

    return this.auth;
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
    return async (request: Request) => {
      const auth = await this.ensureFreshAuth();
      return auth.handler(await normalizeLocalSignInRequest(request));
    };
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
