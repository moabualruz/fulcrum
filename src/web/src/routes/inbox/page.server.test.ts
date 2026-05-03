import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  appendEvent,
  createNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  listEventsByActor,
} from "../../../../product-kernel/store/repositories.ts";

let scratch: string;

interface InboxPayload {
  notifications: Array<{
    id: string;
    title: string;
    verb: string;
    actor: string;
    entity_kind: string;
    entity_id: string;
    read_at: string | null;
    created_at: string;
  }>;
  unreadCount: number;
}

interface ActivityPayload {
  events: Array<{
    id: string;
    actor: string;
    subject_kind: string;
    verb: string;
    created_at: string;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-inbox-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id, slug: "alpha", name: "Alpha",
  });
  return { db, org, project };
}

describe("/inbox — notifications", () => {
  test("listNotifications returns created notifications in DESC order", async () => {
    const { db, org, project } = await seedDb();
    const ev = await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "assigned",
    });
    const n1 = await createNotification(db, {
      orgId: org.id, userId: "user1", eventId: ev.id,
      entityKind: "task", entityId: "t1", title: "Task assigned", verb: "assigned", actor: "alice",
    });
    const ev2 = await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "bob",
      subjectKind: "task", subjectId: "t2", verb: "commented",
    });
    const n2 = await createNotification(db, {
      orgId: org.id, userId: "user1", eventId: ev2.id,
      entityKind: "task", entityId: "t2", title: "Comment on task", verb: "commented", actor: "bob",
    });

    const rows = await listNotifications(db, "user1");
    expect(rows.length).toBe(2);
    // DESC: n2 first
    expect(rows[0]!.id).toBe(n2.id);
    expect(rows[1]!.id).toBe(n1.id);
    await db.close();
  });

  test("countUnreadNotifications counts only unread", async () => {
    const { db, org, project } = await seedDb();
    const ev = await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "assigned",
    });
    await createNotification(db, {
      orgId: org.id, userId: "user1", eventId: ev.id,
      entityKind: "task", entityId: "t1", title: "n1", verb: "assigned", actor: "alice",
    });
    const ev2 = await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "bob",
      subjectKind: "task", subjectId: "t2", verb: "commented",
    });
    const n2 = await createNotification(db, {
      orgId: org.id, userId: "user1", eventId: ev2.id,
      entityKind: "task", entityId: "t2", title: "n2", verb: "commented", actor: "bob",
    });

    expect(await countUnreadNotifications(db, "user1")).toBe(2);

    await markNotificationRead(db, n2.id);
    expect(await countUnreadNotifications(db, "user1")).toBe(1);
    await db.close();
  });

  test("markNotificationRead sets read_at", async () => {
    const { db, org, project } = await seedDb();
    const ev = await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "assigned",
    });
    const n = await createNotification(db, {
      orgId: org.id, userId: "user1", eventId: ev.id,
      entityKind: "task", entityId: "t1", title: "n1", verb: "assigned", actor: "alice",
    });
    expect(n.read_at).toBeNull();

    await markNotificationRead(db, n.id);
    const rows = await listNotifications(db, "user1");
    expect(rows[0]!.read_at).not.toBeNull();
    await db.close();
  });

  test("listNotifications pagination: limit + offset", async () => {
    const { db, org, project } = await seedDb();
    // Seed 5 notifications
    for (let i = 0; i < 5; i++) {
      const ev = await appendEvent(db, {
        orgId: org.id, projectId: project.id, actor: "alice",
        subjectKind: "task", subjectId: `t${i}`, verb: "created",
      });
      await createNotification(db, {
        orgId: org.id, userId: "user1", eventId: ev.id,
        entityKind: "task", entityId: `t${i}`, title: `n${i}`, verb: "created", actor: "alice",
      });
    }

    const page1 = await listNotifications(db, "user1", { limit: 2, offset: 0 });
    expect(page1.length).toBe(2);

    const page2 = await listNotifications(db, "user1", { limit: 2, offset: 2 });
    expect(page2.length).toBe(2);
    // No overlap
    expect(page2[0]!.id).not.toBe(page1[0]!.id);
    expect(page2[0]!.id).not.toBe(page1[1]!.id);

    const page3 = await listNotifications(db, "user1", { limit: 2, offset: 4 });
    expect(page3.length).toBe(1);
    await db.close();
  });
});

describe("/inbox — my activity tab", () => {
  test("listEventsByActor returns only actor's events DESC", async () => {
    const { db, org, project } = await seedDb();
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "created",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "bob",
      subjectKind: "task", subjectId: "t2", verb: "created",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "doc", subjectId: "d1", verb: "edited",
    });

    const aliceEvents = await listEventsByActor(db, "alice");
    expect(aliceEvents.length).toBe(2);
    // All alice
    expect(aliceEvents.every((e) => e.actor === "alice")).toBe(true);
    // DESC order: doc edited last
    expect(aliceEvents[0]!.subject_kind).toBe("doc");
    await db.close();
  });
});
