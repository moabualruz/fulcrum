/**
 * P13#06 — REST parity tests for search/notify/audit/runs/artifacts/repos (RED → GREEN).
 *
 * Acceptance criteria:
 *   1. GET /api/v1/search?q=foo → 200 + SearchResult[] with kind/id/title/snippet
 *   2. GET /api/v1/audit?since=2026-01-01 → 200 + AuditEvent[]
 *   3. GET /api/v1/audit/export?format=csv → streaming CSV; Content-Disposition header
 *   4. GET /api/v1/runs → 200 + AgentRun[]; ?status=running filter works
 *   5. GET /api/v1/runs/:id → 200 + AgentRun | 404 on missing
 *   6. GET /api/v1/notifications → 200 + Notification[]
 *   7. PATCH /api/v1/notifications/:id/mark-read → 204
 *   8. GET /api/v1/artifacts → 200 + Artifact[]
 *   9. GET /api/v1/repos → 200 + Repo[]
 *  10. OpenAPI spec includes all new route groups
 *  11. All routes return 404 when public-api flag is OFF
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPublicApiRouter } from "../../src/api/hono.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NOTIF_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function req(
  method: string,
  path: string,
  body?: unknown,
  orgId: string = ORG_ID,
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: `Bearer test-jwt:${orgId}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("P13#06 — REST parity (search / notify / audit / runs / artifacts / repos)", () => {
  let originalFeatures: string | undefined;

  beforeEach(() => {
    originalFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "public-api";
  });

  afterEach(() => {
    if (originalFeatures === undefined) {
      delete process.env["FULCRUM_FEATURES"];
    } else {
      process.env["FULCRUM_FEATURES"] = originalFeatures;
    }
  });

  // ── flag gate ──────────────────────────────────────────────────────────────
  it("search returns 404 when public-api flag is OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/search?q=foo"));
    expect(res.status).toBe(404);
  });

  // ── search ─────────────────────────────────────────────────────────────────
  it("GET /api/v1/search?q=foo → 200 + SearchResult[]", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/search?q=foo"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/v1/search?q=stub → results contain kind/id/title/snippet", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/search?q=stub"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>[];
    // stub store has at least one result matching "stub"
    expect(body.length).toBeGreaterThan(0);
    const first = body[0];
    expect(first).toHaveProperty("kind");
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("snippet");
  });

  it("GET /api/v1/search?q=foo&kind=task → 200 filtered", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/search?q=foo&kind=task"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  // ── audit ──────────────────────────────────────────────────────────────────
  it("GET /api/v1/audit → 200 + AuditEvent[]", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/audit"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/v1/audit?since=2026-01-01 → 200 + AuditEvent[] filtered", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/audit?since=2026-01-01"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/v1/audit/export?format=csv → streaming CSV with Content-Disposition", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/audit/export?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("audit.csv");
    const text = await res.text();
    // CSV must have a header row
    expect(text).toContain("id,");
  });

  it("GET /api/v1/audit/export?format=json → 200 + JSON array", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/audit/export?format=json"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  // ── runs ───────────────────────────────────────────────────────────────────
  it("GET /api/v1/runs → 200 + AgentRun[]", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/runs"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/v1/runs?status=running → 200 + filtered", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/runs?status=running"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>[];
    expect(Array.isArray(body)).toBe(true);
    // all returned runs must have status=running
    for (const run of body) {
      expect(run["status"]).toBe("running");
    }
  });

  it("GET /api/v1/runs/:id → 200 + AgentRun", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", `/api/v1/runs/${RUN_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id", RUN_ID);
  });

  it("GET /api/v1/runs/:id → 404 on unknown ID", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("GET", "/api/v1/runs/00000000-0000-0000-0000-000000000000"),
    );
    expect(res.status).toBe(404);
  });

  // ── notifications ──────────────────────────────────────────────────────────
  it("GET /api/v1/notifications → 200 + Notification[]", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("PATCH /api/v1/notifications/:id/mark-read → 204", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("PATCH", `/api/v1/notifications/${NOTIF_ID}/mark-read`),
    );
    expect(res.status).toBe(204);
  });

  it("PATCH /api/v1/notifications/:id/mark-read → 404 on unknown ID", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("PATCH", "/api/v1/notifications/00000000-0000-0000-0000-000000000000/mark-read"),
    );
    expect(res.status).toBe(404);
  });

  // ── artifacts ─────────────────────────────────────────────────────────────
  it("GET /api/v1/artifacts → 200 + Artifact[]", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/artifacts"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  // ── repos ──────────────────────────────────────────────────────────────────
  it("GET /api/v1/repos → 200 + Repo[]", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/repos"));
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  // ── OpenAPI spec ───────────────────────────────────────────────────────────
  it("GET /api/v1/openapi.json includes search/audit/runs/notifications/artifacts/repos", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/openapi.json"));
    expect(res.status).toBe(200);
    const spec = await res.json() as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths ?? {});
    expect(paths.some((p) => p.startsWith("/search"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/audit"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/runs"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/notifications"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/artifacts"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/repos"))).toBe(true);
  });
});
