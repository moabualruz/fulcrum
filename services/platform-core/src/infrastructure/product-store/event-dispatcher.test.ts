import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject, listEventsForProject } from "@test-support/product-workspace-fixtures.ts";
import { EventDispatcher } from "./event-dispatcher.ts";
import type { EventRow } from "@test-support/product-workspace-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-dispatcher-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

describe("EventDispatcher", () => {
  let dispatcher: EventDispatcher;

  afterEach(() => {
    dispatcher?.removeAllListeners();
  });

  test("dispatch() persists event and notifies wildcard subscriber", async () => {
    dispatcher = new EventDispatcher();
    const db = await freshDb("dispatch-persist");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const project = await createProject(db, { orgId: org.id, slug: "p1", name: "P1" });

      const received: EventRow[] = [];
      dispatcher.on((e) => { received.push(e); });

      const event = await dispatcher.dispatch(db, {
        orgId: org.id,
        projectId: project.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "task-1",
        verb: "created",
        payload: { title: "Test" },
      });

      // Persisted to DB
      const dbEvents = await listEventsForProject(db, project.id);
      const match = dbEvents.find((e: { id: string }) => e.id === event.id);
      expect(match).toBeDefined();
      expect(match?.verb).toBe("created");

      // Published to subscriber
      expect(received).toHaveLength(1);
      expect(received[0]?.id).toBe(event.id);
    } finally {
      await db.close();
    }
  });

  test("filtered subscription receives only matching events", async () => {
    dispatcher = new EventDispatcher();
    const db = await freshDb("dispatch-filter");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });

      const taskEvents: EventRow[] = [];
      const closedEvents: EventRow[] = [];
      dispatcher.on((e) => { taskEvents.push(e); }, { subjectKind: "task" });
      dispatcher.on((e) => { closedEvents.push(e); }, { verb: "closed" });

      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "task-1",
        verb: "created",
      });
      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "project",
        subjectId: "proj-1",
        verb: "closed",
      });

      expect(taskEvents).toHaveLength(1);
      expect(taskEvents[0]?.subject_kind).toBe("task");
      expect(closedEvents).toHaveLength(1);
      expect(closedEvents[0]?.verb).toBe("closed");
    } finally {
      await db.close();
    }
  });

  test("compound filter matches subject_kind + verb", async () => {
    dispatcher = new EventDispatcher();
    const db = await freshDb("dispatch-compound");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });

      const sprintClosed: EventRow[] = [];
      dispatcher.on((e) => { sprintClosed.push(e); }, { subjectKind: "sprint", verb: "closed" });

      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "sprint",
        subjectId: "s-1",
        verb: "created",
      });
      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "t-1",
        verb: "closed",
      });
      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "sprint",
        subjectId: "s-1",
        verb: "closed",
      });

      expect(sprintClosed).toHaveLength(1);
      expect(sprintClosed[0]?.subject_id).toBe("s-1");
    } finally {
      await db.close();
    }
  });

  test("unsubscribe stops delivery", async () => {
    dispatcher = new EventDispatcher();
    const db = await freshDb("dispatch-unsub");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });

      const received: EventRow[] = [];
      const unsub = dispatcher.on((e) => { received.push(e); });

      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "t-1",
        verb: "created",
      });
      expect(received).toHaveLength(1);

      unsub();

      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "t-2",
        verb: "created",
      });
      expect(received).toHaveLength(1); // no new event
    } finally {
      await db.close();
    }
  });

  test("once() fires handler exactly once", async () => {
    dispatcher = new EventDispatcher();
    const db = await freshDb("dispatch-once");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });

      const received: EventRow[] = [];
      dispatcher.once((e) => { received.push(e); });

      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "t-1",
        verb: "created",
      });
      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "t-2",
        verb: "created",
      });

      expect(received).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("handler error does not break other listeners", async () => {
    dispatcher = new EventDispatcher();
    const db = await freshDb("dispatch-error");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });

      const received: EventRow[] = [];
      dispatcher.on(() => {
        throw new Error("boom");
      });
      dispatcher.on((e) => { received.push(e); });

      await dispatcher.dispatch(db, {
        orgId: org.id,
        actor: "system",
        subjectKind: "task",
        subjectId: "t-1",
        verb: "created",
      });

      // Second handler still received the event despite first throwing
      expect(received).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("listenerCount returns correct count", () => {
    dispatcher = new EventDispatcher();

    expect(dispatcher.listenerCount()).toBe(0);
    const unsub1 = dispatcher.on(() => {});
    const unsub2 = dispatcher.on(() => {}, { subjectKind: "task" });
    expect(dispatcher.listenerCount()).toBe(1);
    expect(dispatcher.listenerCount({ subjectKind: "task" })).toBe(1);

    unsub1();
    unsub2();
    expect(dispatcher.listenerCount()).toBe(0);
    expect(dispatcher.listenerCount({ subjectKind: "task" })).toBe(0);
  });

  test("publish() works without DB (in-memory only)", () => {
    dispatcher = new EventDispatcher();

    const received: EventRow[] = [];
    dispatcher.on((e) => { received.push(e); });

    const fakeEvent: EventRow = {
      id: "test-id",
      org_id: "org-1",
      project_id: null,
      actor: "system",
      subject_kind: "task",
      subject_id: "t-1",
      verb: "created",
      payload: {},
      created_at: new Date().toISOString(),
    };
    dispatcher.publish(fakeEvent);

    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe("test-id");
  });
});
