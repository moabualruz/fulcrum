import { describe, expect, test } from "bun:test";

import {
  RateLimitExceededError,
  createRouterRateLimiter,
} from "./rate-limit.ts";

describe("tRPC rate limiting", () => {
  test("allows requests under threshold and rejects overflow", async () => {
    const limiter = createRouterRateLimiter({
      limit: 2,
      windowMs: 60_000,
      store: new Map(),
      now: () => 1_000,
    });

    await expect(limiter.check({
      path: "webhooks.deliver",
      type: "mutation",
      ctx: { orgId: "org_1", userId: "user_1" },
    })).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(limiter.check({
      path: "webhooks.deliver",
      type: "mutation",
      ctx: { orgId: "org_1", userId: "user_1" },
    })).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(limiter.check({
      path: "webhooks.deliver",
      type: "mutation",
      ctx: { orgId: "org_1", userId: "user_1" },
    })).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  test("keys buckets by org, user, and API key", async () => {
    const limiter = createRouterRateLimiter({
      limit: 1,
      windowMs: 60_000,
      store: new Map(),
      now: () => 1_000,
    });

    await limiter.check({ path: "search.query", type: "query", ctx: { orgId: "org_1", userId: "user_1" } });
    await expect(limiter.check({ path: "search.query", type: "query", ctx: { orgId: "org_1", userId: "user_1" } }))
      .rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(limiter.check({ path: "search.query", type: "query", ctx: { orgId: "org_1", userId: "user_2" } }))
      .resolves.toMatchObject({ allowed: true });
    await expect(limiter.check({ path: "search.query", type: "query", ctx: { orgId: "org_2", userId: "user_1" } }))
      .resolves.toMatchObject({ allowed: true });

    await limiter.check({ path: "search.query", type: "query", ctx: { apiKeyHash: "hash_1" } });
    await expect(limiter.check({ path: "search.query", type: "query", ctx: { apiKeyHash: "hash_1" } }))
      .rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(limiter.check({ path: "search.query", type: "query", ctx: { apiKeyHash: "hash_2" } }))
      .resolves.toMatchObject({ allowed: true });
  });

  test("supports per-route limits", async () => {
    const limiter = createRouterRateLimiter({
      limit: 10,
      windowMs: 60_000,
      routes: {
        "webhooks.deliver": { limit: 1, windowMs: 60_000 },
      },
      store: new Map(),
      now: () => 1_000,
    });

    await expect(limiter.check({ path: "webhooks.deliver", type: "mutation", ctx: { userId: "u1" } }))
      .resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(limiter.check({ path: "webhooks.deliver", type: "mutation", ctx: { userId: "u1" } }))
      .rejects.toBeInstanceOf(RateLimitExceededError);

    await expect(limiter.check({ path: "health.ping", type: "query", ctx: { userId: "u1" } }))
      .resolves.toMatchObject({ allowed: true, remaining: 9 });
  });
});
