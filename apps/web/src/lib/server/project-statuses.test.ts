import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  type EventRow,
} from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createProjectStatus,
  updateProjectStatus,
  deleteProjectStatus,
  listProjectStatuses,
} from "./project-statuses.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-proj-statuses-"));

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

describe("project-statuses CRUD", () => {
  test("create status + list", async () => {
    const { db, orgId, projectId } = await freshDb("create");
    try {
      const { id } = await createProjectStatus(db, { orgId, projectId, name: "To Do" });
      const statuses = await listProjectStatuses(db, projectId);
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.name).toBe("To Do");
      expect(statuses[0]!.color).toBe("#6b7280");
      expect(statuses[0]!.is_final).toBe(false);

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "created")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("create with custom color and is_final", async () => {
    const { db, orgId, projectId } = await freshDb("create-custom");
    try {
      await createProjectStatus(db, { orgId, projectId, name: "Done", color: "#22c55e", isFinal: true });
      const statuses = await listProjectStatuses(db, projectId);
      expect(statuses[0]!.color).toBe("#22c55e");
      expect(statuses[0]!.is_final).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("sort_order auto-increments", async () => {
    const { db, orgId, projectId } = await freshDb("sort");
    try {
      await createProjectStatus(db, { orgId, projectId, name: "A" });
      await createProjectStatus(db, { orgId, projectId, name: "B" });
      const statuses = await listProjectStatuses(db, projectId);
      expect(statuses[0]!.sort_order).toBe(0);
      expect(statuses[1]!.sort_order).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("update name + color", async () => {
    const { db, orgId, projectId } = await freshDb("update");
    try {
      const { id } = await createProjectStatus(db, { orgId, projectId, name: "Old" });
      await updateProjectStatus(db, { id, name: "New", color: "#ef4444" });
      const statuses = await listProjectStatuses(db, projectId);
      expect(statuses[0]!.name).toBe("New");
      expect(statuses[0]!.color).toBe("#ef4444");
    } finally {
      await db.close();
    }
  });

  test("update with no fields throws", async () => {
    const { db, orgId, projectId } = await freshDb("update-none");
    try {
      const { id } = await createProjectStatus(db, { orgId, projectId, name: "S" });
      expect(updateProjectStatus(db, { id })).rejects.toThrow(/no fields/);
    } finally {
      await db.close();
    }
  });

  test("mark as final", async () => {
    const { db, orgId, projectId } = await freshDb("mark-final");
    try {
      const { id } = await createProjectStatus(db, { orgId, projectId, name: "Done" });
      await updateProjectStatus(db, { id, isFinal: true });
      const statuses = await listProjectStatuses(db, projectId);
      expect(statuses[0]!.is_final).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("delete status + event", async () => {
    const { db, orgId, projectId } = await freshDb("delete");
    try {
      const { id } = await createProjectStatus(db, { orgId, projectId, name: "S" });
      await deleteProjectStatus(db, id);
      const statuses = await listProjectStatuses(db, projectId);
      expect(statuses).toHaveLength(0);

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "deleted")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("delete missing status is ok", async () => {
    const { db } = await freshDb("delete-missing");
    try {
      const result = await deleteProjectStatus(db, "01J0NONEXISTENT0000000000");
      expect(result).toEqual({ ok: true });
    } finally {
      await db.close();
    }
  });
});
