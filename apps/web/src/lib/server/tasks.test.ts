import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import {
  createLocalOrg,
  type EventRow,
  type TaskRow,
} from "@/test-support/product-fixtures.ts";
import type { TestStore } from "@/test-support/product-fixtures.ts";
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  moveTaskStatusAction,
} from "./tasks.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-tasks-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: TestStore; orgId: string }> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

async function readTask(db: TestStore, id: string): Promise<TaskRow | undefined> {
  const rows = await db.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [id]);
  return rows[0];
}

async function readEventsForSubject(db: TestStore, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
    [subjectId],
  );
}

describe("server actions: tasks", () => {
  test("createTaskAction inserts row + emits task.created", async () => {
    const { db, orgId } = await freshDb("create");
    try {
      const { id } = await createTaskAction(db, {
        orgId,
        projectId: null,
        title: "First task",
      });
      const row = await readTask(db, id);
      expect(row?.title).toBe("First task");
      expect(row?.status).toBe("pending");
      expect(row?.org_id).toBe(orgId);

      const events = await readEventsForSubject(db, id);
      const created = events.find((e) => e.verb === "created");
      expect(created?.subject_kind).toBe("task");
      expect(created?.subject_id).toBe(id);
      expect(created?.payload).toEqual({ title: "First task", status: "pending" });
    } finally {
      await db.close();
    }
  });

  test("updateTaskAction title change emits changed=['title']", async () => {
    const { db, orgId } = await freshDb("update-title");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "Old" });
      const result = await updateTaskAction(db, { id, title: "New" });
      expect(result).toEqual({ ok: true });

      const row = await readTask(db, id);
      expect(row?.title).toBe("New");

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.subject_kind).toBe("task");
      expect(updated?.payload).toEqual({ changed: ["title"] });
    } finally {
      await db.close();
    }
  });

  test("updateTaskAction status change emits changed=['status']", async () => {
    const { db, orgId } = await freshDb("update-status");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      await updateTaskAction(db, { id, status: "in_progress" });

      const row = await readTask(db, id);
      expect(row?.status).toBe("in_progress");

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.payload).toEqual({ changed: ["status"] });
    } finally {
      await db.close();
    }
  });

  test("updateTaskAction with invalid status throws", async () => {
    const { db, orgId } = await freshDb("update-status-invalid");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      // @ts-expect-error testing runtime validation
      expect(updateTaskAction(db, { id, status: "bogus" })).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("updateTaskAction priority change emits changed=['priority']", async () => {
    const { db, orgId } = await freshDb("update-priority");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      await updateTaskAction(db, { id, priority: 5 });

      const row = await readTask(db, id);
      expect(row?.priority).toBe(5);

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.payload).toEqual({ changed: ["priority"] });
    } finally {
      await db.close();
    }
  });

  test("updateTaskAction throws when no fields provided", async () => {
    const { db, orgId } = await freshDb("update-none");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      expect(updateTaskAction(db, { id })).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("updateTaskAction throws when id is missing", async () => {
    const { db } = await freshDb("update-noid");
    try {
      expect(updateTaskAction(db, { id: "", title: "X" })).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("moveTaskStatusAction succeeds + emits task.status_changed", async () => {
    const { db, orgId } = await freshDb("move-ok");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      const result = await moveTaskStatusAction(db, {
        id,
        from: "pending",
        to: "in_progress",
      });
      expect(result).toEqual({ ok: true });

      const row = await readTask(db, id);
      expect(row?.status).toBe("in_progress");

      const events = await readEventsForSubject(db, id);
      const moved = events.find((e) => e.verb === "status_changed");
      expect(moved?.subject_kind).toBe("task");
      expect(moved?.payload).toEqual({ from: "pending", to: "in_progress", task: id });
    } finally {
      await db.close();
    }
  });

  test("moveTaskStatusAction with wrong from throws status conflict", async () => {
    const { db, orgId } = await freshDb("move-conflict");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      // Real status is pending; passing from=blocked simulates a race.
      expect(
        moveTaskStatusAction(db, { id, from: "blocked", to: "in_progress" }),
      ).rejects.toThrow(/status conflict/);
    } finally {
      await db.close();
    }
  });

  test("moveTaskStatusAction with invalid status name throws", async () => {
    const { db, orgId } = await freshDb("move-invalid");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      expect(
        // @ts-expect-error runtime validation
        moveTaskStatusAction(db, { id, from: "pending", to: "bogus" }),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("deleteTaskAction removes row + emits task.deleted", async () => {
    const { db, orgId } = await freshDb("delete-existing");
    try {
      const { id } = await createTaskAction(db, { orgId, projectId: null, title: "T" });
      const result = await deleteTaskAction(db, id);
      expect(result).toEqual({ ok: true });

      const row = await readTask(db, id);
      expect(row).toBeUndefined();

      const events = await readEventsForSubject(db, id);
      const deleted = events.find((e) => e.verb === "deleted");
      expect(deleted?.subject_kind).toBe("task");
      expect(deleted?.org_id).toBe(orgId);
    } finally {
      await db.close();
    }
  });

  test("deleteTaskAction on missing row returns ok and emits no event", async () => {
    const { db } = await freshDb("delete-missing");
    try {
      const result = await deleteTaskAction(db, "01J0NONEXISTENTULIDAAAAAAAA");
      expect(result).toEqual({ ok: true });

      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE subject_kind = 'task' AND verb = 'deleted'`,
      );
      expect(events).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
