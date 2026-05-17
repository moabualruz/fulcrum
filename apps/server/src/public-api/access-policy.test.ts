import { describe, expect, test } from "bun:test";

import {
  authenticateApiKey,
  createRateLimitPolicy,
  hashApiKey,
} from "./access-policy.ts";

describe("public API access policy", () => {
  test("authenticates bearer API keys by SHA-256 hash", async () => {
    const expectedHash = await hashApiKey("test-api-key");

    await expect(authenticateApiKey(undefined, null)).resolves.toEqual({
      ok: false,
      status: 401,
      body: { error: "authentication required" },
    });
    await expect(authenticateApiKey("Bearer invalid-key", {
      findApiKeyByHash: async () => null,
    })).resolves.toEqual({
      ok: false,
      status: 401,
      body: { error: "invalid API key" },
    });
    await expect(authenticateApiKey("Bearer test-api-key", {
      findApiKeyByHash: async (hash) => {
        expect(hash).toBe(expectedHash);
        return { org_id: "org-1", user_id: "user-1" };
      },
    })).resolves.toEqual({
      ok: true,
      principal: { orgId: "org-1", userId: "user-1" },
    });
  });

  test("returns rate-limit decisions and headers after configured threshold", async () => {
    const check = createRateLimitPolicy({
      limit: 2,
      windowMs: 60_000,
      now: () => 1_700_000_000_000,
      store: new Map(),
    });

    const first = await check({ remoteAddress: "203.0.113.10" });
    const second = await check({ remoteAddress: "203.0.113.10" });
    const third = await check({ remoteAddress: "203.0.113.10" });

    expect(first).toMatchObject({
      allowed: true,
      status: 200,
      headers: {
        "X-RateLimit-Limit": "2",
        "X-RateLimit-Remaining": "1",
        "X-RateLimit-Reset": "1700000060",
      },
    });
    expect(second.allowed).toBe(true);
    expect(second.headers["X-RateLimit-Remaining"]).toBe("0");
    expect(third).toEqual({
      allowed: false,
      status: 429,
      headers: {
        "X-RateLimit-Limit": "2",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1700000060",
      },
      body: {
        error: {
          code: "RATE_LIMITED",
          message: "rate limit exceeded",
        },
      },
    });
  });

  test("keys buckets by user, org, API key, and route scope", async () => {
    const store = new Map();
    const strict = createRateLimitPolicy({ limit: 1, windowMs: 60_000, store, scope: "strict" });
    const loose = createRateLimitPolicy({ limit: 2, windowMs: 60_000, store, scope: "loose" });

    expect((await strict({ userId: "u1" })).status).toBe(200);
    expect((await strict({ userId: "u1" })).status).toBe(429);
    expect((await strict({ userId: "u2" })).status).toBe(200);

    expect((await strict({ orgId: "o1" })).status).toBe(200);
    expect((await strict({ orgId: "o1" })).status).toBe(429);
    expect((await strict({ orgId: "o2" })).status).toBe(200);

    expect((await strict({ authorization: "Bearer key-one" })).status).toBe(200);
    expect((await strict({ authorization: "Bearer key-one" })).status).toBe(429);
    expect((await strict({ authorization: "Bearer key-two" })).status).toBe(200);

    expect((await loose({ remoteAddress: "198.51.100.1" })).status).toBe(200);
    expect((await loose({ remoteAddress: "198.51.100.1" })).status).toBe(200);
    expect((await loose({ remoteAddress: "198.51.100.1" })).status).toBe(429);
  });
});
