import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createLocalOrg,
  createTask,
  appendEvent,
  type EventRow,
} from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import {
  getTaskDetail,
  bulkUpdateStatus,
  bulkDeleteTasks,
} from "./task-detail.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-task-detail-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: TestStore; orgId: string }> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

describe("getTaskDetail", () => {
  test("returns null for missing task", async () => {
    const { db, orgId } = await freshDb("detail-missing");
    try {
      const result = await getTaskDetail(db, "01NONEXISTENT0000000000000", orgId);
      expect(result).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("returns task with subtasks, edges, events", async () => {
    const { db, orgId } = await freshDb("detail-full");
    try {
      const parent = await createTask(db, { orgId, title: "Parent" });
      const child1 = await createTask(db, { orgId, title: "Child 1", parentId: parent.id });
      const child2 = await createTask(db, { orgId, title: "Child 2", parentId: parent.id });

      // Add an edge (blocked-by). The canonical relationship column is `kind`;
      // getTaskDetail selects it as `rel`.
      const edgeId = makeId();
      await db.query(
        `INSERT INTO edges (id, org_id, from_kind, from_id, to_kind, to_id, kind)
           VALUES ($1, $2, 'task', $3, 'task', $4, 'blocked_by')`,
        [edgeId, orgId, parent.id, "01BLOCKER00000000000000000"],
      );

      const result = await getTaskDetail(db, parent.id, orgId);
      expect(result).not.toBeNull();
      expect(result!.task.title).toBe("Parent");
      expect(result!.subtasks).toHaveLength(2);
      expect(result!.subtasks.map((s) => s.title).sort()).toEqual(["Child 1", "Child 2"]);
      expect(result!.edges).toHaveLength(1);
      expect(result!.edges[0]!.rel).toBe("blocked_by");
      // Events: parent created + child1 created + child2 created (only parent's events returned)
      expect(result!.events.length).toBeGreaterThanOrEqual(1);
      expect(result!.events.some((e) => e.verb === "created")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("returns ISO timestamps", async () => {
    const { db, orgId } = await freshDb("detail-iso");
    try {
      const task = await createTask(db, { orgId, title: "TS check" });
      const result = await getTaskDetail(db, task.id, orgId);
      expect(result!.task.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result!.task.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await db.close();
    }
  });
});

describe("bulkUpdateStatus", () => {
  test("updates multiple tasks + emits events", async () => {
    const { db, orgId } = await freshDb("bulk-status");
    try {
      const t1 = await createTask(db, { orgId, title: "A" });
      const t2 = await createTask(db, { orgId, title: "B" });
      const t3 = await createTask(db, { orgId, title: "C" });

      const result = await bulkUpdateStatus(db, [t1.id, t2.id, t3.id], "in_progress", orgId);
      expect(result.updated).toBe(3);

      // Verify DB rows
      for (const id of [t1.id, t2.id, t3.id]) {
        const rows = await db.query<{ status: string }>(`SELECT status FROM tasks WHERE id = $1`, [id]);
        expect(rows[0]!.status).toBe("in_progress");
      }

      // Verify events
      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE verb = 'status_changed' AND (payload->>'bulk')::boolean = true`,
      );
      expect(events.length).toBe(3);
    } finally {
      await db.close();
    }
  });

  test("returns 0 for empty ids", async () => {
    const { db, orgId } = await freshDb("bulk-empty");
    try {
      const result = await bulkUpdateStatus(db, [], "completed", orgId);
      expect(result.updated).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("throws on invalid status", async () => {
    const { db, orgId } = await freshDb("bulk-invalid");
    try {
      // @ts-expect-error testing runtime validation
      await expect(bulkUpdateStatus(db, ["x"], "bogus", orgId)).rejects.toThrow(/invalid status/);
    } finally {
      await db.close();
    }
  });
});

describe("bulkDeleteTasks", () => {
  test("deletes multiple tasks + emits events", async () => {
    const { db, orgId } = await freshDb("bulk-delete");
    try {
      const t1 = await createTask(db, { orgId, title: "X" });
      const t2 = await createTask(db, { orgId, title: "Y" });

      const result = await bulkDeleteTasks(db, [t1.id, t2.id], orgId);
      expect(result.deleted).toBe(2);

      // Verify gone
      for (const id of [t1.id, t2.id]) {
        const rows = await db.query(`SELECT id FROM tasks WHERE id = $1`, [id]);
        expect(rows).toHaveLength(0);
      }

      // Verify events
      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE verb = 'deleted' AND (payload->>'bulk')::boolean = true`,
      );
      expect(events.length).toBe(2);
    } finally {
      await db.close();
    }
  });

  test("returns 0 for empty ids", async () => {
    const { db, orgId } = await freshDb("bulk-delete-empty");
    try {
      const result = await bulkDeleteTasks(db, [], orgId);
      expect(result.deleted).toBe(0);
    } finally {
      await db.close();
    }
  });
});
