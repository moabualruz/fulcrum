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
});
