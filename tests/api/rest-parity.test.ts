/**
 * P13#05 — REST parity tests for tasks, docs, sprints, saved-views (RED → GREEN).
 *
 * Acceptance criteria:
 *   1. POST /api/v1/tasks   → 201 + Task shape
 *   2. GET  /api/v1/tasks   → 200 + Task[]
 *   3. GET  /api/v1/tasks/:id → 200 + Task | 404 on missing
 *   4. PATCH /api/v1/tasks/:id → 200 + updated Task
 *   5. DELETE /api/v1/tasks/:id → 204
 *   6. POST /api/v1/docs    → 201 + Doc shape; doc_type defaults to "note"
 *   7. GET  /api/v1/docs    → 200 + Doc[]
 *   8. POST /api/v1/sprints → 201 + Sprint shape
 *   9. GET  /api/v1/saved-views → 200 + SavedView[]
 *  10. GET  /api/v1/openapi.json includes all four resource groups
 *  11. 403 when JWT orgId does not match resource orgId
 *  12. 404 on unknown resource ID (tasks/:id)
 *  13. All routes return 404 when public-api flag is OFF
 *
 * Auth: Bearer token = "test-jwt:<orgId>" (accepted by test JWT extractor).
 * Flag: FULCRUM_FEATURES=public-api must be set for routes to respond.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPublicApiRouter } from "../../src/api/hono.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPRINT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VIEW_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** Build a request with Bearer auth header. */
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

describe("P13#05 — REST parity (tasks / docs / sprints / saved-views)", () => {
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
  it("returns 404 on all resource routes when public-api flag is OFF", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/tasks"));
    expect(res.status).toBe(404);
  });

  // ── tasks ──────────────────────────────────────────────────────────────────
  it("POST /api/v1/tasks → 201 + Task shape", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("POST", "/api/v1/tasks", {
        orgId: ORG_ID,
        title: "Test task",
        status: "todo",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("orgId", ORG_ID);
    expect(body).toHaveProperty("title", "Test task");
    expect(body).toHaveProperty("status", "todo");
    expect(body).toHaveProperty("createdAt");
  });

  it("GET /api/v1/tasks → 200 + array", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/tasks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/v1/tasks/:id → 200 + Task", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", `/api/v1/tasks/${TASK_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id", TASK_ID);
  });

  it("GET /api/v1/tasks/:id → 404 on unknown ID", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("GET", "/api/v1/tasks/00000000-0000-0000-0000-000000000000"),
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /api/v1/tasks/:id → 200 + updated Task", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("PATCH", `/api/v1/tasks/${TASK_ID}`, { title: "Updated" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id", TASK_ID);
    expect(body).toHaveProperty("title", "Updated");
  });

  it("DELETE /api/v1/tasks/:id → 204", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("DELETE", `/api/v1/tasks/${TASK_ID}`));
    expect(res.status).toBe(204);
  });

  it("GET /api/v1/tasks/:id → 403 when orgId mismatch", async () => {
    const app = createPublicApiRouter();
    // token says OTHER_ORG, resource belongs to ORG_ID
    const res = await app.fetch(
      req("GET", `/api/v1/tasks/${TASK_ID}`, undefined, OTHER_ORG),
    );
    expect(res.status).toBe(403);
  });

  // ── docs ───────────────────────────────────────────────────────────────────
  it("POST /api/v1/docs → 201 + Doc shape with type defaulting to note", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("POST", "/api/v1/docs", { orgId: ORG_ID, title: "My note" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("type", "note");
    expect(body).toHaveProperty("title", "My note");
    expect(body).toHaveProperty("createdAt");
  });

  it("GET /api/v1/docs → 200 + array", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/docs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/v1/docs/:id → 200 + Doc", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", `/api/v1/docs/${DOC_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id", DOC_ID);
  });

  it("PATCH /api/v1/docs/:id → 200 + updated Doc", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("PATCH", `/api/v1/docs/${DOC_ID}`, { title: "Renamed" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id", DOC_ID);
    expect(body).toHaveProperty("title", "Renamed");
  });

  it("DELETE /api/v1/docs/:id → 204", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("DELETE", `/api/v1/docs/${DOC_ID}`));
    expect(res.status).toBe(204);
  });

  // ── sprints ────────────────────────────────────────────────────────────────
  it("POST /api/v1/sprints → 201 + Sprint shape", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("POST", "/api/v1/sprints", {
        orgId: ORG_ID,
        name: "Sprint 1",
        status: "planning",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("name", "Sprint 1");
    expect(body).toHaveProperty("status", "planning");
    expect(body).toHaveProperty("createdAt");
  });

  it("GET /api/v1/sprints → 200 + array", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/sprints"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/v1/sprints/:id → 200 + Sprint", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", `/api/v1/sprints/${SPRINT_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id", SPRINT_ID);
  });

  it("PATCH /api/v1/sprints/:id → 200", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("PATCH", `/api/v1/sprints/${SPRINT_ID}`, { name: "Sprint 1 (revised)" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id", SPRINT_ID);
  });

  it("DELETE /api/v1/sprints/:id → 204", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("DELETE", `/api/v1/sprints/${SPRINT_ID}`));
    expect(res.status).toBe(204);
  });

  // ── saved-views ────────────────────────────────────────────────────────────
  it("GET /api/v1/saved-views → 200 + array", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/saved-views"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /api/v1/saved-views → 201 + SavedView shape", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(
      req("POST", "/api/v1/saved-views", {
        orgId: ORG_ID,
        name: "My view",
        scope: "private",
        viewType: "list",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("name", "My view");
    expect(body).toHaveProperty("scope", "private");
  });

  it("DELETE /api/v1/saved-views/:id → 204", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("DELETE", `/api/v1/saved-views/${VIEW_ID}`));
    expect(res.status).toBe(204);
  });

  // ── OpenAPI spec ───────────────────────────────────────────────────────────
  it("GET /api/v1/openapi.json includes tasks, docs, sprints, saved-views paths", async () => {
    const app = createPublicApiRouter();
    const res = await app.fetch(req("GET", "/api/v1/openapi.json"));
    expect(res.status).toBe(200);
    const spec = await res.json() as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths ?? {});
    expect(paths.some((p) => p.startsWith("/tasks"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/docs"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/sprints"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/saved-views"))).toBe(true);
  });
});
