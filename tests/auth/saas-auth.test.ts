/**
 * tests/auth/saas-auth.test.ts
 *
 * saas-auth flag gate tests — OAuth, magic-link, email OTP.
 *
 * Acceptance criteria (issue #14):
 *   1. saas-auth OFF → POST /api/auth/sign-in/social returns 404 (provider not found).
 *   2. saas-auth ON  → POST /api/auth/sign-in/social returns 200 with a redirect URL.
 *   3. saas-auth OFF → POST /api/auth/email-otp/send-verification-otp returns 404.
 *   4. saas-auth ON  → POST /api/auth/email-otp/send-verification-otp returns non-404.
 *   5. saas-auth OFF → isSaasAuthEnabled() returns false.
 *   6. saas-auth ON  → isSaasAuthEnabled() returns true (env var override).
 *   7. saas-auth ON  → AuthService handler has socialProviders in the auth instance.
 *
 * RED → GREEN: tests written before implementation wiring verified.
 *
 * Per C1: Online/SaaS features gated behind "saas-auth" flag.
 * Per C6: No raw SQL outside src/db/migrations/.
 * Per D5: Flag resolved via env var FULCRUM_FLAG_SAAS_AUTH.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "../../src/db/mikro-orm.config.ts";
import { AuthService } from "../../src/auth/index.ts";

let orm: MikroORM;

// Shared fake DB adapter for standalone auth instances (no ORM required)
function makeStubAdapter(): unknown {
  return (_opts: unknown) => ({
    id: "stub",
    create: async () => ({}),
    findOne: async () => null,
    findMany: async () => [],
    update: async () => ({}),
    updateMany: async () => 0,
    delete: async () => {},
    deleteMany: async () => 0,
    count: async () => 0,
  });
}

beforeAll(async () => {
  const pglite = new PGlite();
  orm = await MikroORM.init(createOrmConfig({ pglite }));
  await orm.schema.create();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

// ─────────────────────────────────────────────────────────────────
// Env var restoration helper
// ─────────────────────────────────────────────────────────────────

function withSaasAuthFlag(enabled: boolean, cb: () => Promise<void>): () => Promise<void> {
  return async () => {
    const orig = process.env["FULCRUM_FLAG_SAAS_AUTH"];
    process.env["FULCRUM_FLAG_SAAS_AUTH"] = enabled ? "true" : "false";
    try {
      await cb();
    } finally {
      if (orig !== undefined) {
        process.env["FULCRUM_FLAG_SAAS_AUTH"] = orig;
      } else {
        delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────────
// 1. saas-auth OFF → social sign-in route returns 404
// ─────────────────────────────────────────────────────────────────

describe("saas-auth flag OFF — OAuth disabled", () => {
  it("POST /api/auth/sign-in/social returns 404 (provider not found)", withSaasAuthFlag(false, async () => {
    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
    });

    const res = await svc.handler(req);
    expect(res.status).toBe(404);
  }));

  it("POST /api/auth/sign-in/social for github returns 404 when saas-auth OFF", withSaasAuthFlag(false, async () => {
    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: "/dashboard" }),
    });

    const res = await svc.handler(req);
    expect(res.status).toBe(404);
  }));
});

// ─────────────────────────────────────────────────────────────────
// 2. saas-auth ON → social sign-in route returns 200 + redirect URL
// ─────────────────────────────────────────────────────────────────

describe("saas-auth flag ON — OAuth enabled", () => {
  it("POST /api/auth/sign-in/social returns 200 with a redirect URL when saas-auth ON", withSaasAuthFlag(true, async () => {
    // Provide minimal OAuth env vars so better-auth can build the redirect URL
    process.env["GOOGLE_CLIENT_ID"] = "test-google-client-id";
    process.env["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret";

    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
    });

    const res = await svc.handler(req);
    // With socialProviders configured, Better-Auth returns 200 + { url: <oauth-url> }
    expect(res.status).toBe(200);
    const body = await res.json() as { url?: string };
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("accounts.google.com");

    delete process.env["GOOGLE_CLIENT_ID"];
    delete process.env["GOOGLE_CLIENT_SECRET"];
  }));
});

// ─────────────────────────────────────────────────────────────────
// 3. saas-auth OFF → email OTP route returns 404
// ─────────────────────────────────────────────────────────────────

describe("saas-auth flag OFF — email OTP disabled", () => {
  it("POST /api/auth/email-otp/send-verification-otp returns 404 when saas-auth OFF", withSaasAuthFlag(false, async () => {
    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", type: "email-verification" }),
    });

    const res = await svc.handler(req);
    expect(res.status).toBe(404);
  }));
});

// ─────────────────────────────────────────────────────────────────
// 4. saas-auth ON → email OTP route is active (non-404)
// ─────────────────────────────────────────────────────────────────

describe("saas-auth flag ON — email OTP enabled", () => {
  it("POST /api/auth/email-otp/send-verification-otp returns non-404 when saas-auth ON", withSaasAuthFlag(true, async () => {
    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", type: "email-verification" }),
    });

    const res = await svc.handler(req);
    // Plugin is registered → route exists (200 or 400/422 for missing user, not 404)
    expect(res.status).not.toBe(404);
  }));
});

// ─────────────────────────────────────────────────────────────────
// 5. isSaasAuthEnabled() — OFF by default in clean env
// ─────────────────────────────────────────────────────────────────

describe("isSaasAuthEnabled() — flag resolution", () => {
  it("returns false when env var is not set (local mode default)", async () => {
    const orig = process.env["FULCRUM_FLAG_SAAS_AUTH"];
    delete process.env["FULCRUM_FLAG_SAAS_AUTH"];

    const svc = new AuthService(orm.em);
    const enabled = await svc.isSaasAuthEnabled();
    expect(enabled).toBe(false);

    if (orig !== undefined) process.env["FULCRUM_FLAG_SAAS_AUTH"] = orig;
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. isSaasAuthEnabled() — ON via env var
  // ─────────────────────────────────────────────────────────────────
  it("returns true when FULCRUM_FLAG_SAAS_AUTH=true", async () => {
    const orig = process.env["FULCRUM_FLAG_SAAS_AUTH"];
    process.env["FULCRUM_FLAG_SAAS_AUTH"] = "true";

    const svc = new AuthService(orm.em);
    const enabled = await svc.isSaasAuthEnabled();
    expect(enabled).toBe(true);

    if (orig !== undefined) {
      process.env["FULCRUM_FLAG_SAAS_AUTH"] = orig;
    } else {
      delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// 7. saas-auth ON → magic-link plugin route is active (non-404)
// ─────────────────────────────────────────────────────────────────

describe("saas-auth flag ON — magic-link enabled", () => {
  it("GET /api/auth/magic-link/* route exists when saas-auth ON", withSaasAuthFlag(true, async () => {
    const svc = new AuthService(orm.em);
    await svc.init();

    // magic-link verify endpoint — plugin registers this route; 400 = route exists
    const req = new Request("http://localhost/api/auth/magic-link/verify?token=bad-token", {
      method: "GET",
    });

    const res = await svc.handler(req);
    // Route exists → not 404. Bad token → typically 302 redirect or 400/401.
    expect(res.status).not.toBe(404);
  }));

  it("GET /api/auth/magic-link/verify returns 404 when saas-auth OFF", withSaasAuthFlag(false, async () => {
    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/magic-link/verify?token=bad-token", {
      method: "GET",
    });

    const res = await svc.handler(req);
    expect(res.status).toBe(404);
  }));
});
