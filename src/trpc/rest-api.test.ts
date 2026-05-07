import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../test-support/product-fixtures.ts";
import { createLocalOrg } from "../test-support/product-fixtures.ts";
import { createRun } from "../test-support/product-fixtures.ts";
import { createSymphonyRestApi, isPublicApiEnabled } from "./rest-api.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-rest-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

describe("REST API feature gate", () => {
  test("isPublicApiEnabled returns false when env not set", () => {
    const orig = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    expect(isPublicApiEnabled()).toBe(false);
    if (orig !== undefined) process.env.FULCRUM_FEATURES = orig;
  });

  test("isPublicApiEnabled returns true when public-api in features", () => {
    const orig = process.env.FULCRUM_FEATURES;
    process.env.FULCRUM_FEATURES = "some-flag,public-api,other";
    expect(isPublicApiEnabled()).toBe(true);
    if (orig !== undefined) process.env.FULCRUM_FEATURES = orig;
    else delete process.env.FULCRUM_FEATURES;
  });
});

describe("REST API routes", () => {
  test("GET /api/v1/symphony/state returns status JSON", async () => {
    const db = await freshDb("rest-state");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await createRun(db, { orgId: org.id, identifier: "r1" });

      const app = createSymphonyRestApi(db, org.id);
      const res = await app.request("/api/v1/symphony/state");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.pending).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("GET /api/v1/symphony/:identifier returns run", async () => {
    const db = await freshDb("rest-get");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const run = await createRun(db, { orgId: org.id, identifier: "r1" }) as { id: string };

      const app = createSymphonyRestApi(db, org.id);
      const res = await app.request(`/api/v1/symphony/${run.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe(run.id);
    } finally {
      await db.close();
    }
  });

  test("GET /api/v1/symphony/:identifier returns 404 for missing", async () => {
    const db = await freshDb("rest-404");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const app = createSymphonyRestApi(db, org.id);
      const res = await app.request("/api/v1/symphony/nonexistent");
      expect(res.status).toBe(404);
    } finally {
      await db.close();
    }
  });

  test("POST /api/v1/symphony/refresh returns runs list", async () => {
    const db = await freshDb("rest-refresh");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await createRun(db, { orgId: org.id, identifier: "r1" });

      const app = createSymphonyRestApi(db, org.id);
      const res = await app.request("/api/v1/symphony/refresh", { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.count).toBe(1);
    } finally {
      await db.close();
    }
  });
});
