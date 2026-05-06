import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import { createLocalOrg, createProject, createTask, createSprint } from "../../test-support/product-fixtures.ts";
import type { TestStore } from "../../test-support/product-fixtures.ts";
import { createPublicApi, isPublicApiEnabled } from "./router.ts";
import { makeId } from "../../test-support/product-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-api-"));
let db: TestStore;
let orgId: string;
let projectId: string;
let apiKey: string;
let keyHash: string;

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

beforeAll(async () => {
  db = await openIsolatedStore(join(scratch, "api-test"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "test", name: "Test" });
  orgId = org.id;
  const proj = await createProject(db, { orgId, slug: "p1", name: "Project 1" });
  projectId = proj.id;

  // Create API key
  apiKey = "test-api-key-" + makeId();
  keyHash = await hashKey(apiKey);
  await db.query(
    `INSERT INTO api_keys (id, org_id, user_id, key_hash, name) VALUES ($1, $2, $3, $4, $5)`,
    [makeId(), orgId, "user-1", keyHash, "Test Key"],
  );
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

function app() {
  return createPublicApi(db, orgId);
}

function authHeaders() {
  return { Authorization: `Bearer ${apiKey}` };
}

async function req(method: string, path: string, body?: any, headers?: Record<string, string>) {
  const a = app();
  const init: RequestInit = {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  return a.request(path, init);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

// ── Feature gate ─────────────────────────────────────────────────────

describe("isPublicApiEnabled", () => {
  test("returns false when FULCRUM_FEATURES unset", () => {
    const old = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    expect(isPublicApiEnabled()).toBe(false);
    if (old !== undefined) process.env.FULCRUM_FEATURES = old;
  });

  test("returns true when FULCRUM_FEATURES includes public-api", () => {
    const old = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "other,public-api,another";
    expect(isPublicApiEnabled()).toBe(true);
    process.env.FULCRUM_FEATURES = old ?? "";
  });
});

// ── Auth ─────────────────────────────────────────────────────────────

describe("auth", () => {
  test("unauthenticated request returns 401", async () => {
    const res = await req("GET", "/tasks?project_id=" + projectId);
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBeDefined();
  });

  test("invalid API key returns 401", async () => {
    const res = await req("GET", "/tasks?project_id=" + projectId, undefined, {
      Authorization: "Bearer invalid-key",
    });
    expect(res.status).toBe(401);
  });

  test("valid API key returns 200", async () => {
    const res = await req("GET", "/tasks?project_id=" + projectId, undefined, authHeaders());
    expect(res.status).toBe(200);
  });
});

// ── Tasks CRUD ───────────────────────────────────────────────────────

describe("tasks API", () => {
  test("GET /tasks returns paginated list", async () => {
    // Seed a task
    await createTask(db, { orgId, projectId, title: "API task 1" });

    const res = await req("GET", "/tasks?project_id=" + projectId, undefined, authHeaders());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].title).toBeDefined();
    // cursor is string or null
    expect(body.cursor === null || typeof body.cursor === "string").toBe(true);
  });

  test("POST /tasks creates task", async () => {
    const res = await req(
      "POST",
      "/tasks",
      { title: "Created via API", project_id: projectId },
      authHeaders(),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeDefined();
  });

  test("POST /tasks with missing title returns 400", async () => {
    const res = await req("POST", "/tasks", { project_id: projectId }, authHeaders());
    // zod-openapi returns 400 on validation failure
    expect(res.status).toBe(400);
  });

  test("PATCH /tasks/:id updates task", async () => {
    const task = await createTask(db, { orgId, projectId, title: "To update" });
    const res = await req(
      "PATCH",
      `/tasks/${task.id}`,
      { title: "Updated via API" },
      authHeaders(),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  test("PATCH /tasks/:id with bad id returns 404", async () => {
    const res = await req(
      "PATCH",
      "/tasks/NONEXISTENT000000000000000",
      { title: "X" },
      authHeaders(),
    );
    expect(res.status).toBe(404);
  });

  test("DELETE /tasks/:id returns 204", async () => {
    const task = await createTask(db, { orgId, projectId, title: "To delete" });
    const res = await req("DELETE", `/tasks/${task.id}`, undefined, authHeaders());
    expect(res.status).toBe(204);
  });
});

// ── Sprints CRUD ─────────────────────────────────────────────────────

describe("sprints API", () => {
  test("GET /sprints returns list", async () => {
    await createSprint(db, { orgId, projectId, name: "Sprint 1" });
    const res = await req("GET", "/sprints?project_id=" + projectId, undefined, authHeaders());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("POST /sprints creates sprint", async () => {
    const res = await req(
      "POST",
      "/sprints",
      { project_id: projectId, name: "Sprint 2" },
      authHeaders(),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeDefined();
    expect(body.name).toBe("Sprint 2");
  });

  test("PATCH /sprints/:id updates sprint", async () => {
    const sprint = await createSprint(db, { orgId, projectId, name: "To patch" });
    const res = await req(
      "PATCH",
      `/sprints/${sprint.id}`,
      { name: "Patched" },
      authHeaders(),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.name).toBe("Patched");
  });
});

// ── Reports ──────────────────────────────────────────────────────────

describe("reports API", () => {
  test("GET /reports/velocity returns array", async () => {
    const res = await req(
      "GET",
      "/reports/velocity?project_id=" + projectId,
      undefined,
      authHeaders(),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /reports/burndown returns array", async () => {
    const sprint = await createSprint(db, {
      orgId,
      projectId,
      name: "Burn Sprint",
      startDate: "2026-05-01",
      endDate: "2026-05-14",
      capacityPoints: 20,
    });
    const res = await req(
      "GET",
      `/reports/burndown?project_id=${projectId}&sprint_id=${sprint.id}`,
      undefined,
      authHeaders(),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ── OpenAPI spec ─────────────────────────────────────────────────────

describe("OpenAPI spec", () => {
  test("GET /openapi.json returns valid spec", async () => {
    const a = app();
    const res = await a.request("/openapi.json");
    expect(res.status).toBe(200);
    const spec = await json(res);
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Fulcrum Public API");
    expect(spec.paths).toBeDefined();
    expect(spec.paths["/tasks"]).toBeDefined();
    expect(spec.paths["/sprints"]).toBeDefined();
    expect(spec.paths["/reports/burndown"]).toBeDefined();
    expect(spec.paths["/reports/velocity"]).toBeDefined();
  });

  test("OpenAPI spec parses without errors via @readme/openapi-parser", async () => {
    const a = app();
    const res = await a.request("/openapi.json");
    const spec = await json(res);
    const { validate } = await import("@readme/openapi-parser");
    // validate() throws on invalid spec
    await validate(structuredClone(spec));
  });
});

// ── Flag OFF ─────────────────────────────────────────────────────────

describe("flag OFF behavior", () => {
  test("isPublicApiEnabled returns false by default", () => {
    const old = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    expect(isPublicApiEnabled()).toBe(false);
    if (old !== undefined) process.env.FULCRUM_FEATURES = old;
  });
});
