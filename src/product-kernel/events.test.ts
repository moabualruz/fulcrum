import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import {
  appendEvent,
  createLocalOrg,
  createProject,
  createTask,
  listEventsForProject,
} from "./store/repositories.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-events-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

describe("repositories + event log", () => {
  test("creating a project writes a project row and a created event", async () => {
    const db = await freshDb("project-events");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const project = await createProject(db, { orgId: org.id, slug: "p1", name: "P1" });
      expect(project.org_id).toBe(org.id);
      const events = await listEventsForProject(db, project.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.subject_kind).toBe("project");
      expect(events[0]?.verb).toBe("created");
    } finally {
      await db.close();
    }
  });

  test("creating a task writes a task row and a created event", async () => {
    const db = await freshDb("task-events");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const project = await createProject(db, { orgId: org.id, slug: "p1", name: "P1" });
      const task = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Build kernel",
      });
      expect(task.title).toBe("Build kernel");
      const events = await listEventsForProject(db, project.id);
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.subject_kind)).toEqual(["project", "task"]);
      const taskEvent = events[1];
      expect(taskEvent?.verb).toBe("created");
      expect(taskEvent?.payload).toMatchObject({ title: "Build kernel", status: "pending" });
    } finally {
      await db.close();
    }
  });

  test("appendEvent supports custom payloads and stable ordering", async () => {
    const db = await freshDb("payload-events");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const project = await createProject(db, { orgId: org.id, slug: "p1", name: "P1" });
      await appendEvent(db, {
        orgId: org.id,
        projectId: project.id,
        actor: "agent:codex",
        subjectKind: "project",
        subjectId: project.id,
        verb: "noted",
        payload: { tag: "review" },
      });
      const events = await listEventsForProject(db, project.id);
      expect(events).toHaveLength(2);
      expect(events[1]?.actor).toBe("agent:codex");
      expect(events[1]?.payload).toEqual({ tag: "review" });
    } finally {
      await db.close();
    }
  });
});
