import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import { createLocalOrg, createProject } from "../../test-support/product-fixtures.ts";
import { indexSearchDocument } from "../search.ts";
import { createSearchApi } from "./search-api.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-api-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Stub authenticator: "Bearer valid-token" → "user1", else null */
async function stubAuth(header: string | undefined): Promise<string | null> {
  if (header === "Bearer valid-token") return "user1";
  return null;
}

describe("search API — flag OFF → 404", () => {
  test("GET /api/v1/search returns 404 when public-api disabled", async () => {
    const db = await openIsolatedStore(join(scratch, "off1"));
    try {
      await migrateIsolatedStore(db);
      const app = createSearchApi({
        db,
        featuresEnv: "",
        authenticate: stubAuth,
      });
      const res = await app.request("/api/v1/search?q=foo&org_id=x", {
        headers: { authorization: "Bearer valid-token" },
      });
      expect(res.status).toBe(404);
    } finally {
      await db.close();
    }
  });

  test("GET /api/v1/search/suggest returns 404 when disabled", async () => {
    const db = await openIsolatedStore(join(scratch, "off2"));
    try {
      await migrateIsolatedStore(db);
      const app = createSearchApi({
        db,
        featuresEnv: "",
        authenticate: stubAuth,
      });
      const res = await app.request("/api/v1/search/suggest?prefix=f&org_id=x", {
        headers: { authorization: "Bearer valid-token" },
      });
      expect(res.status).toBe(404);
    } finally {
      await db.close();
    }
  });

  test("GET /api/v1/search/saved returns 404 when disabled", async () => {
    const db = await openIsolatedStore(join(scratch, "off3"));
    try {
      await migrateIsolatedStore(db);
      const app = createSearchApi({
        db,
        featuresEnv: "",
        authenticate: stubAuth,
      });
      const res = await app.request(
        "/api/v1/search/saved?org_id=x&user_id=u",
        { headers: { authorization: "Bearer valid-token" } },
      );
      expect(res.status).toBe(404);
    } finally {
      await db.close();
    }
  });
});

describe("search API — auth", () => {
  test("missing auth → 401", async () => {
    const db = await openIsolatedStore(join(scratch, "auth1"));
    try {
      await migrateIsolatedStore(db);
      const app = createSearchApi({
        db,
        featuresEnv: "public-api",
        authenticate: stubAuth,
      });
      const res = await app.request("/api/v1/search?q=foo&org_id=x");
      expect(res.status).toBe(401);
    } finally {
      await db.close();
    }
  });

  test("bad token → 401", async () => {
    const db = await openIsolatedStore(join(scratch, "auth2"));
    try {
      await migrateIsolatedStore(db);
      const app = createSearchApi({
        db,
        featuresEnv: "public-api",
        authenticate: stubAuth,
      });
      const res = await app.request("/api/v1/search?q=foo&org_id=x", {
        headers: { authorization: "Bearer bad" },
      });
      expect(res.status).toBe(401);
    } finally {
      await db.close();
    }
  });
});

describe("search API — flag ON + authed", () => {
  test("GET /api/v1/search returns results", async () => {
    const db = await openIsolatedStore(join(scratch, "on1"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "task",
        sourceId: "t1",
        title: "kernel task",
        body: "kernel description",
      });
      const app = createSearchApi({
        db,
        featuresEnv: "public-api",
        authenticate: stubAuth,
      });
      const res = await app.request(
        `/api/v1/search?q=kernel&org_id=${org.id}`,
        { headers: { authorization: "Bearer valid-token" } },
      );
      expect(res.status).toBe(200);
      const json = await res.json() as Array<{ title: string }>;
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBeGreaterThanOrEqual(1);
      const first = json[0];
      expect(first).toBeDefined();
      expect(first!.title).toBe("kernel task");
    } finally {
      await db.close();
    }
  });

  test("GET /api/v1/search/suggest returns suggestions", async () => {
    const db = await openIsolatedStore(join(scratch, "on2"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o2", name: "O2" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "foobar doc",
        body: "b",
      });
      const app = createSearchApi({
        db,
        featuresEnv: "public-api",
        authenticate: stubAuth,
      });
      const res = await app.request(
        `/api/v1/search/suggest?prefix=foo&org_id=${org.id}`,
        { headers: { authorization: "Bearer valid-token" } },
      );
      expect(res.status).toBe(200);
      const json = await res.json() as { suggestions: string[] };
      expect(json.suggestions).toContain("foobar doc");
    } finally {
      await db.close();
    }
  });

  test("saved search CRUD via REST", async () => {
    const db = await openIsolatedStore(join(scratch, "on3"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o3", name: "O3" });
      const app = createSearchApi({
        db,
        featuresEnv: "public-api",
        authenticate: stubAuth,
      });
      const headers = {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
      };

      // Create
      const createRes = await app.request("/api/v1/search/saved", {
        method: "POST",
        headers,
        body: JSON.stringify({
          org_id: org.id,
          user_id: "user1",
          name: "my saved",
          query_json: { text: "test" },
          scope: "private",
        }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json() as { name: string };
      expect(created.name).toBe("my saved");

      // List
      const listRes = await app.request(
        `/api/v1/search/saved?org_id=${org.id}&user_id=user1`,
        { headers: { authorization: "Bearer valid-token" } },
      );
      expect(listRes.status).toBe(200);
      const list = await listRes.json();
      expect(list).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});

describe("search API — OpenAPI spec", () => {
  test("GET /api/openapi.json returns valid spec", async () => {
    const db = await openIsolatedStore(join(scratch, "spec"));
    try {
      await migrateIsolatedStore(db);
      const app = createSearchApi({
        db,
        featuresEnv: "public-api",
        authenticate: stubAuth,
      });
      const res = await app.request("/api/openapi.json");
      expect(res.status).toBe(200);
      const spec = await res.json() as { openapi: string; paths: Record<string, unknown> };
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.paths["/api/v1/search"]).toBeDefined();
      expect(spec.paths["/api/v1/search/suggest"]).toBeDefined();
      expect(spec.paths["/api/v1/search/saved"]).toBeDefined();
    } finally {
      await db.close();
    }
  });
});
