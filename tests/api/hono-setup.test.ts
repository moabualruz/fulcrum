/**
 * P13#04 — Hono public API setup tests (RED → GREEN).
 *
 * Acceptance criteria:
 *   1. FULCRUM_FEATURES=public-api OFF → GET /api/v1/openapi.json returns 404.
 *   2. FULCRUM_FEATURES=public-api ON  → GET /api/v1/openapi.json returns 200
 *      with valid OpenAPI 3.1 JSON (openapi field starts with "3.1").
 *   3. createPublicApi() returns a Hono app with .fetch() method.
 *   4. createPublicApiRouter() wires /api/v1 prefix on the parent app.
 *   5. Flag-gating is applied per-request (dynamic env read, not build-time).
 *
 * Out-of-scope: JWT auth, rate limiting, individual route parity (P13#07–P13#14).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPublicApi, createPublicApiRouter } from "@fulcrum/server/api/hono.ts";

describe("P13#04 — Hono public API setup", () => {
  let originalFeatures: string | undefined;

  beforeEach(() => {
    originalFeatures = process.env["FULCRUM_FEATURES"];
  });

  afterEach(() => {
    if (originalFeatures === undefined) {
      delete process.env["FULCRUM_FEATURES"];
    } else {
      process.env["FULCRUM_FEATURES"] = originalFeatures;
    }
  });

  // ── AC1: flag OFF → 404 on openapi.json ────────────────────────────────────
  it("returns 404 on /api/v1/openapi.json when public-api flag is OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];

    const app = createPublicApiRouter();
    const res = await app.request("/api/v1/openapi.json");

    expect(res.status).toBe(404);
  });

  it("returns 404 on any /api/v1/* route when public-api flag is OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];

    const app = createPublicApiRouter();
    const res = await app.request("/api/v1/tasks");

    expect(res.status).toBe(404);
  });

  // ── AC2: flag ON → 200 with OpenAPI 3.1 JSON ───────────────────────────────
  it("returns 200 on /api/v1/openapi.json when public-api flag is ON", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";

    const app = createPublicApiRouter();
    const res = await app.request("/api/v1/openapi.json");

    expect(res.status).toBe(200);
  });

  it("returns valid OpenAPI 3.1 JSON when public-api flag is ON", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";

    const app = createPublicApiRouter();
    const res = await app.request("/api/v1/openapi.json");
    const body = await res.json();

    expect(body).toHaveProperty("openapi");
    expect((body as { openapi: string }).openapi).toMatch(/^3\.1/);
    expect(body).toHaveProperty("info");
    expect(body).toHaveProperty("paths");
  });

  // ── AC3: createPublicApi() returns a Hono app ──────────────────────────────
  it("createPublicApi() returns an app with a fetch method", () => {
    const api = createPublicApi();
    expect(typeof api.fetch).toBe("function");
  });

  // ── AC4: createPublicApiRouter() mounts at /api/v1 ─────────────────────────
  it("createPublicApiRouter() routes live under /api/v1 prefix", async () => {
    process.env["FULCRUM_FEATURES"] = "public-api";

    const app = createPublicApiRouter();
    // /api/v1/openapi.json must respond (not 404 from wrong prefix)
    const res = await app.request("/api/v1/openapi.json");
    expect(res.status).toBe(200);

    // /openapi.json at root must NOT respond (wrong prefix)
    const rootRes = await app.request("/openapi.json");
    expect(rootRes.status).toBe(404);
  });

  // ── AC5: flag gating is per-request ────────────────────────────────────────
  it("honours flag toggle between requests (dynamic env read)", async () => {
    const app = createPublicApiRouter();

    delete process.env["FULCRUM_FEATURES"];
    const offRes = await app.request("/api/v1/openapi.json");
    expect(offRes.status).toBe(404);

    process.env["FULCRUM_FEATURES"] = "public-api";
    const onRes = await app.request("/api/v1/openapi.json");
    expect(onRes.status).toBe(200);
  });
});
