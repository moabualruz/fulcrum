import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  type EventRow,
} from "@/test-support/product-fixtures.ts";
import type { TestStore } from "@/test-support/product-fixtures.ts";
import {
  createCustomField,
  updateCustomField,
  archiveCustomField,
  listCustomFields,
  type CustomFieldRow,
} from "./custom-fields.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-custom-fields-"));

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

describe("custom-fields CRUD", () => {
  test("create text field + list", async () => {
    const { db, orgId, projectId } = await freshDb("create-text");
    try {
      const { id } = await createCustomField(db, {
        orgId,
        projectId,
        name: "Priority Label",
        fieldType: "text",
      });
      const fields = await listCustomFields(db, projectId);
      expect(fields).toHaveLength(1);
      expect(fields[0]!.name).toBe("Priority Label");
      expect(fields[0]!.field_type).toBe("text");
      expect(fields[0]!.required).toBe(false);
      expect(fields[0]!.archived).toBe(false);

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "created")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("create select field with options", async () => {
    const { db, orgId, projectId } = await freshDb("create-select");
    try {
      const { id } = await createCustomField(db, {
        orgId,
        projectId,
        name: "Size",
        fieldType: "select",
        options: ["S", "M", "L"],
        required: true,
      });
      const fields = await listCustomFields(db, projectId);
      expect(fields[0]!.required).toBe(true);
      const opts = fields[0]!.options;
      expect(opts).toEqual(["S", "M", "L"]);
    } finally {
      await db.close();
    }
  });

  test("update field name", async () => {
    const { db, orgId, projectId } = await freshDb("update-name");
    try {
      const { id } = await createCustomField(db, { orgId, projectId, name: "Old", fieldType: "text" });
      await updateCustomField(db, { id, name: "New" });
      const fields = await listCustomFields(db, projectId);
      expect(fields[0]!.name).toBe("New");

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "updated")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("update with no fields throws", async () => {
    const { db, orgId, projectId } = await freshDb("update-none");
    try {
      const { id } = await createCustomField(db, { orgId, projectId, name: "F", fieldType: "text" });
      expect(updateCustomField(db, { id })).rejects.toThrow(/no fields/);
    } finally {
      await db.close();
    }
  });

  test("archive hides from default list", async () => {
    const { db, orgId, projectId } = await freshDb("archive");
    try {
      const { id } = await createCustomField(db, { orgId, projectId, name: "F", fieldType: "text" });
      await archiveCustomField(db, id);

      const visible = await listCustomFields(db, projectId);
      expect(visible).toHaveLength(0);

      const all = await listCustomFields(db, projectId, true);
      expect(all).toHaveLength(1);
      expect(all[0]!.archived).toBe(true);

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "archived")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("sort_order auto-increments", async () => {
    const { db, orgId, projectId } = await freshDb("sort-order");
    try {
      await createCustomField(db, { orgId, projectId, name: "A", fieldType: "text" });
      await createCustomField(db, { orgId, projectId, name: "B", fieldType: "number" });
      const fields = await listCustomFields(db, projectId);
      expect(fields[0]!.sort_order).toBe(0);
      expect(fields[1]!.sort_order).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("invalid field_type throws", async () => {
    const { db, orgId, projectId } = await freshDb("invalid-type");
    try {
      expect(
        // @ts-expect-error testing runtime validation
        createCustomField(db, { orgId, projectId, name: "F", fieldType: "bogus" }),
      ).rejects.toThrow(/invalid field_type/);
    } finally {
      await db.close();
    }
  });
});
