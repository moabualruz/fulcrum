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
} from "../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-inbox-load-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedNotifications(count: number) {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id, slug: "alpha", name: "Alpha",
  });
  for (let i = 0; i < count; i++) {
    const ev = await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: `t${i}`, verb: "assigned",
    });
    await createNotification(db, {
      orgId: org.id, userId: "admin@local", eventId: ev.id,
      entityKind: "task", entityId: `t${i}`,
      title: `Notification ${i}`, verb: "assigned", actor: "alice",
    });
  }
  await db.close();
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

describe("/inbox +page.server.ts load", () => {
  test("load returns notifications for default user", async () => {
    await seedNotifications(3);

    const { load } = await import("./+page.server.ts");
    const result = load({
      url: new URL("http://localhost/inbox"),
      locals: { activeProjectId: null },
    } as any);

    const payload = await streamedData<{
      notifications: Array<{ id: string; title: string }>;
      unreadCount: number;
    }>(result);
    expect(payload.notifications.length).toBe(3);
    expect(payload.unreadCount).toBe(3);
  });

  test("load with tab=activity returns actor events", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    await appendEvent(db, {
      orgId: org.id, actor: "admin@local",
      subjectKind: "task", subjectId: "t1", verb: "created",
    });
    await db.close();

    const { load } = await import("./+page.server.ts");
    const result = load({
      url: new URL("http://localhost/inbox?tab=activity"),
      locals: { activeProjectId: null },
    } as any);

    const payload = await streamedData<{
      events: Array<{ id: string; actor: string }>;
    }>(result);
    expect(payload.events.length).toBeGreaterThanOrEqual(1);
    expect(payload.events[0]!.actor).toBe("admin@local");
  });
});
