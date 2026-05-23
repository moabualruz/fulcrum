import { afterEach, describe, expect, test } from "bun:test";

import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { DomainEventOutbox } from "@platform-core/infrastructure/application-database/entities/platform/DomainEventOutbox.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import {
  createOutboxWorker,
  dispatchPendingOutboxEvents,
  getUnreadNotificationCount,
  OUTBOX_CONSUMER_MAP,
  OUTBOX_PGLITE_FALLBACK_BEHAVIOR,
  writeOutboxEvent,
  type OutboxDispatcher,
} from "@workflow-coordination/application/outbox.ts";

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
  audited: unknown[];
  workflowEvents: unknown[];
} {
  const published: Array<{ topic: string; payload: unknown }> = [];
  const indexed: unknown[] = [];
  const notified: unknown[] = [];
  const audited: unknown[] = [];
  const workflowEvents: unknown[] = [];
  return {
    published,
    indexed,
    notified,
    audited,
    workflowEvents,
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
    audit: {
      async handleEvent(event) {
        audited.push(event);
      },
    },
    workflow: {
      async handleEvent(event) {
        workflowEvents.push(event);
      },
    },
  };
}

describe("transactional outbox integration", () => {
  test("same transaction creates domain mutation, Event row, and outbox row", async () => {
    const testDb = await freshDb();
    const em = testDb.em;

    const created = await em.transactional(async (txEm) => {
      const task = txEm.create(Task, {
        id: "33333333-3333-4333-8333-333333333333",
        org: txEm.getReference(Org, DEFAULT_ORG_ID),
        title: "same transaction outbox",
      });
      txEm.persist(task);
      await writeOutboxEvent(txEm, {
        orgId: DEFAULT_ORG_ID,
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
    const em = testDb.em;
    await writeOutboxEvent(em, {
      orgId: DEFAULT_ORG_ID,
      projectId: "22222222-2222-4222-8222-222222222222",
      verb: "task.updated",
      subjectKind: "task",
      subjectId: "task-1",
      payload: { title: "dispatch" },
    });
    /* flushed */

    const sinks = dispatcher();

    const first = await dispatchPendingOutboxEvents(em, sinks);
    const second = await dispatchPendingOutboxEvents(em, sinks);

    expect(first.dispatched).toBe(1);
    expect(second.dispatched).toBe(0);
    expect(sinks.published).toHaveLength(1);
    expect(sinks.indexed).toHaveLength(1);
    expect(sinks.notified).toHaveLength(1);
    expect(sinks.audited).toHaveLength(1);
    expect(sinks.workflowEvents).toHaveLength(1);
    expect(sinks.published[0]!.payload).toMatchObject({
      schemaVersion: 1,
      eventType: "task.updated",
      eventKey: expect.any(String),
    });
  });

  test("consumer failure retries without publishing, then dead-letters with observable metadata", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await writeOutboxEvent(em, {
      orgId: DEFAULT_ORG_ID,
      projectId: "22222222-2222-4222-8222-222222222222",
      verb: "task.updated",
      subjectKind: "task",
      subjectId: "task-retry",
      payload: { title: "retry" },
    });

    const sinks = dispatcher();
    sinks.search = {
      async handleEvent() {
        throw new Error("search unavailable");
      },
    };

    const first = await dispatchPendingOutboxEvents(em, sinks, { maxAttempts: 2 });
    const second = await dispatchPendingOutboxEvents(em, sinks, { maxAttempts: 2 });
    const outbox = await em.findOneOrFail(DomainEventOutbox, { subjectId: "task-retry" } as never);

    expect(first).toMatchObject({ dispatched: 0, retried: 1, deadLettered: 0 });
    expect(second).toMatchObject({ dispatched: 0, retried: 0, deadLettered: 1 });
    expect(sinks.published).toHaveLength(0);
    expect(outbox.processedAt).toBeInstanceOf(Date);
    expect(outbox.payload["_outbox"]).toMatchObject({
      attempts: 2,
      deadLettered: true,
      lastError: "search unavailable",
    });
  });

  test("documents PGlite fallback latency and consumer ownership map", () => {
    expect(OUTBOX_PGLITE_FALLBACK_BEHAVIOR).toContain("pollingIntervalMs");
    expect(OUTBOX_CONSUMER_MAP.map((consumer) => consumer.domain).sort()).toEqual([
      "audit",
      "notification",
      "search",
      "subscription",
      "workflow",
    ]);
  });

  test("worker dispatch exposes polling loop with pg-notify fast path", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
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

    try {
      await worker.start();
      await writeOutboxEvent(em, {
        orgId: DEFAULT_ORG_ID,
        projectId: "22222222-2222-4222-8222-222222222222",
        verb: "task.updated",
        subjectKind: "task",
        subjectId: "task-2",
        payload: {},
      });
      /* flushed */
      const notify = notifyHandler as (() => Promise<void>) | null;
      if (notify) await notify();
    } finally {
      await worker.stop();
    }

    expect(sinks.published).toHaveLength(1);
  });

  test("bell count query reads through application notification query", async () => {
    const testDb = await freshDb();
    const em = testDb.em;

    expect(await getUnreadNotificationCount(em, DEFAULT_ORG_ID, USER_ID)).toBe(0);
  });
});
