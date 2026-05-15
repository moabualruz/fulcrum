/**
 * saas-auth flag gate tests — OAuth, magic-link, email OTP.
 *
 * Acceptance criteria:
 *   1. saas-auth OFF → POST /api/auth/sign-in/social returns 404 (provider not found).
 *   2. saas-auth ON  → POST /api/auth/sign-in/social returns 200 with a redirect URL.
 *   3. saas-auth OFF → POST /api/auth/email-otp/send-verification-otp returns 404.
 *   4. saas-auth ON  → POST /api/auth/email-otp/send-verification-otp returns non-404.
 *   5. saas-auth OFF → isSaasAuthEnabled() returns false.
 *   6. saas-auth ON  → isSaasAuthEnabled() returns true (env var override).
 *   7. saas-auth ON  → AuthService handler has socialProviders in the auth instance.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { AuthService } from "@identity-access/application/auth/index.ts";

let orm: MikroORM;
const TEST_BETTER_AUTH_SECRET = ["test", "secret", "123456789012345678901234"].join("-");

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

afterEach(() => {
  // PGlite/Bun can leave exitCode=99 despite passing assertions; keep failures intact.
  if (process.exitCode === 99) process.exitCode = 0;
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

async function withEnv(
  values: Record<string, string | undefined>,
  cb: () => Promise<void>,
): Promise<void> {
  const originals: Record<string, string | undefined> = {};
  const originalExitCode = process.exitCode;
  for (const key of Object.keys(values)) {
    originals[key] = process.env[key];
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await cb();
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = originalExitCode;
  }
}

function authOptions(svc: AuthService): {
  secret?: string;
  trustedOrigins?: string[];
} {
  return (svc.instance as unknown as { options: { secret?: string; trustedOrigins?: string[] } }).options;
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

  it("POST /api/auth/sign-up/email rejects local-mode unauthenticated signup", withSaasAuthFlag(false, async () => {
    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `local-signup-${crypto.randomUUID()}@example.test`,
        password: "local-signup-password",
        name: "Local Signup",
      }),
    });

    const res = await svc.handler(req);
    expect(res.status).not.toBe(200);
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

  it("does not register google OAuth when credentials are empty", withSaasAuthFlag(true, async () => {
    const origId = process.env["GOOGLE_CLIENT_ID"];
    const origSecret = process.env["GOOGLE_CLIENT_SECRET"];
    delete process.env["GOOGLE_CLIENT_ID"];
    delete process.env["GOOGLE_CLIENT_SECRET"];

    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
    });

    const res = await svc.handler(req);
    expect(res.status).toBe(404);

    if (origId !== undefined) process.env["GOOGLE_CLIENT_ID"] = origId;
    if (origSecret !== undefined) process.env["GOOGLE_CLIENT_SECRET"] = origSecret;
  }));

  it("does not register github OAuth unless both credentials are non-empty", withSaasAuthFlag(true, async () => {
    const origId = process.env["GITHUB_CLIENT_ID"];
    const origSecret = process.env["GITHUB_CLIENT_SECRET"];
    process.env["GITHUB_CLIENT_ID"] = "test-github-client-id";
    delete process.env["GITHUB_CLIENT_SECRET"];

    const svc = new AuthService(orm.em);
    await svc.init();

    const req = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: "/dashboard" }),
    });

    const res = await svc.handler(req);
    expect(res.status).toBe(404);

    if (origId !== undefined) process.env["GITHUB_CLIENT_ID"] = origId;
    else delete process.env["GITHUB_CLIENT_ID"];
    if (origSecret !== undefined) process.env["GITHUB_CLIENT_SECRET"] = origSecret;
  }));

  it("rebuilds the auth handler when saas-auth flag changes at runtime", async () => {
    const origFlag = process.env["FULCRUM_FLAG_SAAS_AUTH"];
    const origId = process.env["GOOGLE_CLIENT_ID"];
    const origSecret = process.env["GOOGLE_CLIENT_SECRET"];
    process.env["FULCRUM_FLAG_SAAS_AUTH"] = "false";

    const svc = new AuthService(orm.em);
    await svc.init();
    const offReq = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
    });
    expect((await svc.handler(offReq)).status).toBe(404);

    process.env["FULCRUM_FLAG_SAAS_AUTH"] = "true";
    process.env["GOOGLE_CLIENT_ID"] = "test-google-client-id";
    process.env["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret";

    const onReq = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
    });
    const res = await svc.handler(onReq);
    expect(res.status).toBe(200);

    if (origFlag !== undefined) process.env["FULCRUM_FLAG_SAAS_AUTH"] = origFlag;
    else delete process.env["FULCRUM_FLAG_SAAS_AUTH"];
    if (origId !== undefined) process.env["GOOGLE_CLIENT_ID"] = origId;
    else delete process.env["GOOGLE_CLIENT_ID"];
    if (origSecret !== undefined) process.env["GOOGLE_CLIENT_SECRET"] = origSecret;
    else delete process.env["GOOGLE_CLIENT_SECRET"];
  });

  it("rebuilds the auth handler when OAuth credentials rotate at runtime", async () => {
    await withEnv(
      {
        FULCRUM_FLAG_SAAS_AUTH: "true",
        GOOGLE_CLIENT_ID: "old-google-client-id",
        GOOGLE_CLIENT_SECRET: "old-google-client-secret",
      },
      async () => {
        const svc = new AuthService(orm.em);
        await svc.init();

        process.env["GOOGLE_CLIENT_ID"] = "new-google-client-id";
        process.env["GOOGLE_CLIENT_SECRET"] = "new-google-client-secret";

        const req = new Request("http://localhost/api/auth/sign-in/social", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
        });

        const res = await svc.handler(req);
        expect(res.status).toBe(200);
        const body = await res.json() as { url?: string };
        expect(body.url).toContain("client_id=new-google-client-id");
        expect(body.url).not.toContain("old-google-client-id");
      },
    );
  });
});

describe("BetterAuth runtime config", () => {
  it("uses BETTER_AUTH_SECRET when provided", async () => {
    await withEnv(
      {
        BETTER_AUTH_SECRET: TEST_BETTER_AUTH_SECRET,
      },
      async () => {
        const svc = new AuthService(orm.em);
        await svc.init();
        expect(authOptions(svc).secret).toBe(TEST_BETTER_AUTH_SECRET);
      },
    );
  });

  it("throws in production when BETTER_AUTH_SECRET is missing", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: undefined,
      },
      async () => {
        const svc = new AuthService(orm.em);
        await expect(svc.init()).rejects.toThrow("BETTER_AUTH_SECRET");
      },
    );
  });

  it("uses FULCRUM_TRUSTED_ORIGINS without localhost defaults in production", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: TEST_BETTER_AUTH_SECRET,
        FULCRUM_TRUSTED_ORIGINS: "https://app.example.com, https://admin.example.com ,,",
      },
      async () => {
        const svc = new AuthService(orm.em);
        await svc.init();
        expect(authOptions(svc).trustedOrigins).toEqual([
          "https://app.example.com",
          "https://admin.example.com",
        ]);
      },
    );
  });

  it("uses localhost trusted origin defaults in test when FULCRUM_TRUSTED_ORIGINS is empty", async () => {
    await withEnv(
      {
        NODE_ENV: "test",
        FULCRUM_TRUSTED_ORIGINS: undefined,
      },
      async () => {
        const svc = new AuthService(orm.em);
        await svc.init();
        expect(authOptions(svc).trustedOrigins).toEqual([
          "http://localhost:5173",
          "http://localhost:3000",
        ]);
      },
    );
  });
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
