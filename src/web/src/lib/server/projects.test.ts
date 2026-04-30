import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  listEventsForProject,
  type EventRow,
  type ProjectRow,
} from "../../../../product-kernel/store/repositories.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import {
  createProjectAction,
  updateProjectAction,
  deleteProjectAction,
} from "./projects.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-projects-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: ProductDb; orgId: string }> {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

async function readProject(db: ProductDb, id: string): Promise<ProjectRow | undefined> {
  const rows = await db.query<ProjectRow>(`SELECT * FROM projects WHERE id = $1`, [id]);
  return rows[0];
}

async function readEventsForSubject(db: ProductDb, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
    [subjectId],
  );
}

describe("server actions: projects", () => {
  test("createProjectAction inserts project row and writes project.created event", async () => {
    const { db, orgId } = await freshDb("create");
    try {
      const { id } = await createProjectAction(db, {
        orgId,
        slug: "alpha",
        name: "Alpha",
        description: "first project",
      });
      const row = await readProject(db, id);
      expect(row?.slug).toBe("alpha");
      expect(row?.name).toBe("Alpha");
      expect(row?.description).toBe("first project");
      expect(row?.org_id).toBe(orgId);

      const events = await listEventsForProject(db, id);
      expect(events).toHaveLength(1);
      expect(events[0]?.subject_kind).toBe("project");
      expect(events[0]?.subject_id).toBe(id);
      expect(events[0]?.verb).toBe("created");
    } finally {
      await db.close();
    }
  });

  test("updateProjectAction with name change emits project.updated payload.changed=['name']", async () => {
    const { db, orgId } = await freshDb("update-name");
    try {
      const { id } = await createProjectAction(db, { orgId, slug: "a", name: "A" });
      const result = await updateProjectAction(db, { id, name: "Renamed" });
      expect(result).toEqual({ ok: true });

      const row = await readProject(db, id);
      expect(row?.name).toBe("Renamed");

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.subject_kind).toBe("project");
      expect(updated?.payload).toEqual({ changed: ["name"] });
    } finally {
      await db.close();
    }
  });

  test("updateProjectAction with description change emits project.updated payload.changed=['description']", async () => {
    const { db, orgId } = await freshDb("update-desc");
    try {
      const { id } = await createProjectAction(db, { orgId, slug: "b", name: "B" });
      await updateProjectAction(db, { id, description: "new" });

      const row = await readProject(db, id);
      expect(row?.description).toBe("new");

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.payload).toEqual({ changed: ["description"] });
    } finally {
      await db.close();
    }
  });

  test("updateProjectAction with both fields emits one event with changed=['name','description']", async () => {
    const { db, orgId } = await freshDb("update-both");
    try {
      const { id } = await createProjectAction(db, { orgId, slug: "c", name: "C" });
      await updateProjectAction(db, { id, name: "C2", description: "d2" });

      const row = await readProject(db, id);
      expect(row?.name).toBe("C2");
      expect(row?.description).toBe("d2");

      const events = await readEventsForSubject(db, id);
      const updates = events.filter((e) => e.verb === "updated");
      expect(updates).toHaveLength(1);
      expect(updates[0]?.payload).toEqual({ changed: ["name", "description"] });
    } finally {
      await db.close();
    }
  });

  test("updateProjectAction throws when no fields provided", async () => {
    const { db, orgId } = await freshDb("update-none");
    try {
      const { id } = await createProjectAction(db, { orgId, slug: "d", name: "D" });
      expect(updateProjectAction(db, { id })).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("updateProjectAction throws when id is missing", async () => {
    const { db } = await freshDb("update-noid");
    try {
      expect(updateProjectAction(db, { id: "", name: "X" })).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("deleteProjectAction removes existing project, emits project.deleted, returns ok", async () => {
    const { db, orgId } = await freshDb("delete-existing");
    try {
      const { id } = await createProjectAction(db, { orgId, slug: "e", name: "E" });
      const result = await deleteProjectAction(db, id);
      expect(result).toEqual({ ok: true });

      const row = await readProject(db, id);
      expect(row).toBeUndefined();

      const events = await readEventsForSubject(db, id);
      const deleted = events.find((e) => e.verb === "deleted");
      expect(deleted?.subject_kind).toBe("project");
      expect(deleted?.org_id).toBe(orgId);
    } finally {
      await db.close();
    }
  });

  test("deleteProjectAction on missing row returns ok and emits no event", async () => {
    const { db } = await freshDb("delete-missing");
    try {
      const result = await deleteProjectAction(db, "01J0NONEXISTENTULIDAAAAAAAA");
      expect(result).toEqual({ ok: true });

      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE verb = 'deleted'`,
      );
      expect(events).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
