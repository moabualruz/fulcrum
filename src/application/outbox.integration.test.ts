import { afterEach, describe, expect, test } from "bun:test";

import { Event } from "../db/entities/core/Event.ts";
import { DomainEventOutbox } from "../db/entities/platform/DomainEventOutbox.ts";
import { createTask } from "./tasks/commands.ts";
import { DEFAULT_ORG_ID } from "../db/seed.ts";
import { createTestOrm, type TestOrm } from "../test-utils/db.ts";
import {
  createOutboxWorker,
  dispatchPendingOutboxEvents,
  getUnreadNotificationCount,
  writeOutboxEvent,
  type OutboxDispatcher,
} from "./outbox.ts";

const USER_ID = "00000000-0000-0000-0000-000000000010";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

function dispatcher(): OutboxDispatcher & {
  published: Array<{ topic: string; payload: unknown }>;
  indexed: unknown[];
  notified: unknown[];
} {
  const published: Array<{ topic: string; payload: unknown }> = [];
  const indexed: unknown[] = [];
  const notified: unknown[] = [];
  return {
    published,
    indexed,
    notified,
    eventBus: {
      publish(topic, payload) {
        published.push({ topic, payload });
      },
    },
    search: {
      async handleEvent(event) {
        indexed.push(event);
      },
    },
    notifications: {
      async handleEvent(event) {
        notified.push(event);
      },
    },
  };
}

describe("transactional outbox integration", () => {
  test("same transaction creates domain mutation, Event row, and outbox row", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();

    const created = await em.transactional(async (txEm) => {
      const task = await createTask(txEm, {
        orgId: DEFAULT_ORG_ID,
        userId: USER_ID,
        projectId: "project-outbox",
      }, {
        title: "same transaction outbox",
        projectId: "project-outbox",
      });
      await writeOutboxEvent(txEm, {
        orgId: DEFAULT_ORG_ID,
        projectId: "project-outbox",
        verb: "task.created",
        subjectKind: "task",
        subjectId: task.id,
        payload: { title: task.title },
      });
      return task;
    });

    const events = await em.find(Event, {
      org: DEFAULT_ORG_ID,
      verb: "task.created",
      subjectId: created.id,
    } as never);
    const outbox = await em.find(DomainEventOutbox, {
      org: DEFAULT_ORG_ID,
      verb: "task.created",
      subjectId: created.id,
    } as never);

    expect(events).toHaveLength(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.processedAt).toBeNull();
  });

  test("idempotent dispatch marks outbox row processed once and fans out to event bus/search/notifications", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    await writeOutboxEvent(em, {
      orgId: DEFAULT_ORG_ID,
      projectId: "project-outbox",
      verb: "task.updated",
      subjectKind: "task",
      subjectId: "task-1",
      payload: { title: "dispatch" },
    });
    await em.flush();

    const sinks = dispatcher();

    const first = await dispatchPendingOutboxEvents(em, sinks);
    const second = await dispatchPendingOutboxEvents(em, sinks);

    expect(first.dispatched).toBe(1);
    expect(second.dispatched).toBe(0);
    expect(sinks.published).toHaveLength(1);
    expect(sinks.indexed).toHaveLength(1);
    expect(sinks.notified).toHaveLength(1);
  });

  test("worker dispatch exposes polling loop with pg-notify fast path", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const sinks = dispatcher();
    let notifyHandler: (() => Promise<void>) | null = null;

    const worker = createOutboxWorker({
      em,
      dispatcher: sinks,
      pollingIntervalMs: 50,
      listenForNotify: async (_channel, handler) => {
        notifyHandler = handler;
        return async () => {
          notifyHandler = null;
        };
      },
    });

    await worker.start();
    await writeOutboxEvent(em, {
      orgId: DEFAULT_ORG_ID,
      projectId: "project-outbox",
      verb: "task.updated",
      subjectKind: "task",
      subjectId: "task-2",
      payload: {},
    });
    await em.flush();
    await notifyHandler?.();
    await worker.stop();

    expect(sinks.published).toHaveLength(1);
  });

  test("bell count query reads through application notification query", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();

    expect(await getUnreadNotificationCount(em, DEFAULT_ORG_ID, USER_ID)).toBe(0);
  });
});
