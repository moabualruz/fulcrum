import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  type EventRow,
} from "../../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../../test-support/product-fixtures.ts";
import {
  createSavedView,
  updateSavedView,
  deleteSavedView,
  listSavedViews,
} from "./saved-views.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-saved-views-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: TestStore; orgId: string; projectId: string }> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const proj = await createProject(db, { orgId: org.id, slug: "test", name: "Test" });
  return { db, orgId: org.id, projectId: proj.id };
}

async function readEvents(db: TestStore, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
    [subjectId],
  );
}

describe("saved-views CRUD", () => {
  test("create view + list", async () => {
    const { db, orgId, projectId } = await freshDb("create");
    try {
      const { id } = await createSavedView(db, {
        orgId,
        projectId,
        name: "High Priority Open",
        filters: { status: "pending", priority: "high" },
      });
      const views = await listSavedViews(db, projectId);
      expect(views).toHaveLength(1);
      expect(views[0]!.name).toBe("High Priority Open");
      expect(views[0]!.scope).toBe("project");
      expect(views[0]!.filters).toEqual({ status: "pending", priority: "high" });
      expect(views[0]!.is_default).toBe(false);

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "created")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("set as default clears other defaults", async () => {
    const { db, orgId, projectId } = await freshDb("default");
    try {
      const { id: id1 } = await createSavedView(db, {
        orgId, projectId, name: "V1", isDefault: true,
      });
      const { id: id2 } = await createSavedView(db, {
        orgId, projectId, name: "V2", isDefault: true,
      });
      const views = await listSavedViews(db, projectId);
      const v1 = views.find((v) => v.id === id1);
      const v2 = views.find((v) => v.id === id2);
      expect(v1!.is_default).toBe(false);
      expect(v2!.is_default).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("update view name + set default via update", async () => {
    const { db, orgId, projectId } = await freshDb("update");
    try {
      const { id } = await createSavedView(db, { orgId, projectId, name: "Old" });
      await updateSavedView(db, { id, name: "New", isDefault: true });
      const views = await listSavedViews(db, projectId);
      expect(views[0]!.name).toBe("New");
      expect(views[0]!.is_default).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("update with no fields throws", async () => {
    const { db, orgId, projectId } = await freshDb("update-none");
    try {
      const { id } = await createSavedView(db, { orgId, projectId, name: "V" });
      expect(updateSavedView(db, { id })).rejects.toThrow(/no fields/);
    } finally {
      await db.close();
    }
  });

  test("invalid scope throws", async () => {
    const { db, orgId, projectId } = await freshDb("invalid-scope");
    try {
      expect(
        // @ts-expect-error testing runtime validation
        createSavedView(db, { orgId, projectId, name: "V", scope: "bogus" }),
      ).rejects.toThrow(/invalid scope/);
    } finally {
      await db.close();
    }
  });

  test("delete view", async () => {
    const { db, orgId, projectId } = await freshDb("delete");
    try {
      const { id } = await createSavedView(db, { orgId, projectId, name: "V" });
      await deleteSavedView(db, id);
      const views = await listSavedViews(db, projectId);
      expect(views).toHaveLength(0);

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "deleted")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("delete missing view is ok", async () => {
    const { db } = await freshDb("delete-missing");
    try {
      const result = await deleteSavedView(db, "01J0NONEXISTENT0000000000");
      expect(result).toEqual({ ok: true });
    } finally {
      await db.close();
    }
  });
});
