import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createPublicApi, createPublicApiRouter } from "../hono.ts";
import { rateLimit } from "../rate-limit.ts";
import { listMissingApiDomains } from "@/surfaces/parity.ts";

const API_ROUTE_MODULES = {
  tasks: "kernel-tasks.ts",
  sprints: "kernel-sprints.ts",
  docs: "docs.ts",
  memory: "memory.ts",
  runs: "runs.ts",
  repos: "repos.ts",
  artifacts: "artifacts.ts",
  search: "search.ts",
  notifications: "kernel-notifications.ts",
} as const;

describe("Phase 08 REST API parity inventory", () => {
  test("createPublicApi registers required public route groups", async () => {
    const source = await readFile(new URL("../hono.ts", import.meta.url), "utf-8");
    const registered = Object.keys(API_ROUTE_MODULES).filter((domain) => {
      const routeName = domain === "notifications" ? "KernelNotification" : domain[0]!.toUpperCase() + domain.slice(1, -Number(domain.endsWith("s")));
      return source.toLowerCase().includes(`register${routeName.toLowerCase()}`);
    });

    expect(listMissingApiDomains(registered)).toEqual([]);
  });

  test("serves OpenAPI through /api/v1/openapi.json and compatibility /api/openapi.json", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const api = createPublicApiRouter();

    const v1 = await api.request("/api/v1/openapi.json");
    const compat = await api.request("/api/openapi.json");

    expect(v1.status).toBe(200);
    expect(compat.status).toBe(200);
    expect(((await v1.json()) as { openapi: string }).openapi).toBe("3.1.0");
    expect(((await compat.json()) as { openapi: string }).openapi).toBe("3.1.0");
  });

  test("OpenAPI 3.1 document includes every Phase 08 public domain path", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const api = createPublicApiRouter();

    const response = await api.request("/api/v1/openapi.json");
    const spec = await response.json() as { openapi: string; paths?: Record<string, unknown> };
    const paths = Object.keys(spec.paths ?? {});

    expect(spec.openapi).toBe("3.1.0");
    expect(paths).toContain("/tasks");
    expect(paths).toContain("/docs");
    expect(paths).toContain("/search");
    expect(paths).toContain("/runs");
    expect(paths).toContain("/repos");
    expect(paths).toContain("/artifacts");
    expect(paths).toContain("/memory");
    expect(paths).toContain("/notifications");
  });

  test("authenticated API responses include standard rate-limit headers", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";
    const api = createPublicApiRouter();

    const response = await api.request("/api/v1/search?q=fulcrum", {
      headers: { Authorization: "Bearer test-jwt:11111111-1111-4111-8111-111111111111" },
    });

    expect(response.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(response.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  test("rate limiter keeps one bucket per caller identity and returns RATE_LIMITED", async () => {
    const store = new Map();
    const app = new Hono<{ Variables: { userId: string; orgId: string } }>();
    app.use("*", async (c, next) => {
      c.set("userId", "user-1");
      c.set("orgId", "org-1");
      return next();
    });
    app.use("*", rateLimit({ limit: 2, windowMs: 60_000, now: () => 1_700_000_000_000, store }));
    app.get("/limited", (c) => c.json({ ok: true }));

    const first = await app.request("/limited");
    const second = await app.request("/limited");
    const third = await app.request("/limited");

    expect(first.headers.get("X-RateLimit-Remaining")).toBe("1");
    expect(second.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "rate limit exceeded" },
    });
    expect(store.size).toBe(1);
  });

  test("Phase 5-7 route modules are service-backed, not in-memory stubs", async () => {
    const routesRoot = new URL("../routes/", import.meta.url).pathname;
    const stubbed: string[] = [];

    for (const [domain, file] of Object.entries(API_ROUTE_MODULES)) {
      const source = await readFile(join(routesRoot, file), "utf-8");
      if (
        source.includes("Stub store") ||
        source.includes(`In-memory ${"stub"} store`) ||
        source.includes("makeStubStore") ||
        source.includes("STUB_")
      ) {
        stubbed.push(domain);
      }
    }

    expect(stubbed).toEqual([]);
  });

  test("public API OpenAPI spec includes docs, search, and artifacts paths", () => {
    const api = createPublicApi();
    const spec = api.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "Fulcrum Public API", version: "1" },
    });
    const paths = Object.keys(spec.paths ?? {});

    expect(paths).toContain("/docs");
    expect(paths).toContain("/search");
    expect(paths).toContain("/artifacts");
  });
});
