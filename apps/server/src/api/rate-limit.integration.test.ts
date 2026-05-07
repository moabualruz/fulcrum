import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { rateLimit } from "./rate-limit.ts";

describe("REST rate limiting", () => {
  test("returns HTTP 429 after configured threshold", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ limit: 2, windowMs: 60_000, store: new Map() }));
    app.get("/resource", (c) => c.json({ ok: true }));

    const first = await app.request("/resource", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const second = await app.request("/resource", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const third = await app.request("/resource", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "rate limit exceeded",
      },
    });
  });

  test("keys buckets by user, org, and API key", async () => {
    const store = new Map();
    const app = new Hono();
    app.use("/user/*", async (c, next) => {
      c.set("userId" as never, c.req.header("x-user-id") as never);
      await next();
    });
    app.use("/org/*", async (c, next) => {
      c.set("orgId" as never, c.req.header("x-org-id") as never);
      await next();
    });
    app.use("*", rateLimit({ limit: 1, windowMs: 60_000, store }));
    app.get("*", (c) => c.json({ ok: true }));

    expect((await app.request("/user/resource", { headers: { "x-user-id": "u1" } })).status).toBe(200);
    expect((await app.request("/user/resource", { headers: { "x-user-id": "u1" } })).status).toBe(429);
    expect((await app.request("/user/resource", { headers: { "x-user-id": "u2" } })).status).toBe(200);

    expect((await app.request("/org/resource", { headers: { "x-org-id": "o1" } })).status).toBe(200);
    expect((await app.request("/org/resource", { headers: { "x-org-id": "o1" } })).status).toBe(429);
    expect((await app.request("/org/resource", { headers: { "x-org-id": "o2" } })).status).toBe(200);

    expect((await app.request("/api/resource", { headers: { Authorization: "Bearer key-one" } })).status).toBe(200);
    expect((await app.request("/api/resource", { headers: { Authorization: "Bearer key-one" } })).status).toBe(429);
    expect((await app.request("/api/resource", { headers: { Authorization: "Bearer key-two" } })).status).toBe(200);
  });

  test("supports per-route limits", async () => {
    const store = new Map();
    const app = new Hono();
    app.use("/strict/*", rateLimit({ limit: 1, windowMs: 60_000, store }));
    app.use("/loose/*", rateLimit({ limit: 2, windowMs: 60_000, store }));
    app.get("*", (c) => c.json({ ok: true }));

    expect((await app.request("/strict/resource", { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(200);
    expect((await app.request("/strict/resource", { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(429);

    expect((await app.request("/loose/resource", { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(200);
    expect((await app.request("/loose/resource", { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(200);
    expect((await app.request("/loose/resource", { headers: { "x-forwarded-for": "198.51.100.1" } })).status).toBe(429);
  });
});
