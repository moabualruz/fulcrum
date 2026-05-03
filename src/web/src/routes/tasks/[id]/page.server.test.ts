import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createTask,
} from "../../../../../product-kernel/store/repositories.ts";
import type { ProductDb } from "../../../../../product-kernel/db/types.ts";
import { getTaskDetail, bulkUpdateStatus, bulkDeleteTasks } from "../../../lib/server/task-detail.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-task-route-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: ProductDb; orgId: string }> {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

describe("task detail route data", () => {
  test("getTaskDetail returns full payload for existing task", async () => {
    const { db, orgId } = await freshDb("route-detail");
    try {
      const task = await createTask(db, { orgId, title: "Route test", description: "desc" });
      const child = await createTask(db, { orgId, title: "Sub", parentId: task.id });
      const detail = await getTaskDetail(db, task.id, orgId);
      expect(detail).not.toBeNull();
      expect(detail!.task.title).toBe("Route test");
      expect(detail!.task.description).toBe("desc");
      expect(detail!.subtasks).toHaveLength(1);
      expect(detail!.subtasks[0]!.title).toBe("Sub");
      expect(detail!.events.length).toBeGreaterThanOrEqual(1);
    } finally {
      await db.close();
    }
  });

  test("getTaskDetail returns null for wrong org", async () => {
    const { db, orgId } = await freshDb("route-wrong-org");
    try {
      const task = await createTask(db, { orgId, title: "T" });
      const detail = await getTaskDetail(db, task.id, "01WRONG0000000000000000000");
      expect(detail).toBeNull();
    } finally {
      await db.close();
    }
  });
});

describe("bulk ops integration", () => {
  test("bulk status + bulk delete round-trip", async () => {
    const { db, orgId } = await freshDb("route-bulk");
    try {
      const t1 = await createTask(db, { orgId, title: "A" });
      const t2 = await createTask(db, { orgId, title: "B" });
      const t3 = await createTask(db, { orgId, title: "C" });

      await bulkUpdateStatus(db, [t1.id, t2.id], "completed", orgId);
      const rows = await db.query<{ id: string; status: string }>(
        `SELECT id, status FROM tasks WHERE id = ANY($1::text[])`,
        [[t1.id, t2.id]],
      );
      expect(rows.every((r) => r.status === "completed")).toBe(true);

      await bulkDeleteTasks(db, [t1.id, t3.id], orgId);
      const remaining = await db.query(`SELECT id FROM tasks WHERE org_id = $1`, [orgId]);
      expect(remaining).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});
