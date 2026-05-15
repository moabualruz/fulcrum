import { describe, expect, test } from "bun:test";

import { DomainEventOutbox } from "@platform-core/infrastructure/application-database/entities/platform/DomainEventOutbox.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import {
  createOutboxWorker,
  dispatchPendingOutboxEvents,
  serializeOutboxEvent,
  topicForOutboxEvent,
  writeOutboxEvent,
  type OutboxDispatcher,
  type OutboxEventInput,
} from "@workflow-coordination/application/outbox.ts";

const EVENT_INPUT: OutboxEventInput = {
  orgId: "00000000-0000-0000-0000-000000000001",
  projectId: "22222222-2222-4222-8222-222222222222",
  verb: "task.created",
  subjectKind: "task",
  subjectId: "task-1",
  payload: { title: "Outbox task" },
};

describe("application outbox serialization", () => {
  test("serializeOutboxEvent produces stable JSON-safe event envelope", () => {
    const serialized = serializeOutboxEvent(EVENT_INPUT);

    expect(serialized).toMatchObject({
      orgId: EVENT_INPUT.orgId,
      projectId: EVENT_INPUT.projectId,
      verb: "task.created",
      subjectKind: "task",
      subjectId: "task-1",
      payload: { title: "Outbox task" },
    });
    expect(serialized.eventKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(serializeOutboxEvent(EVENT_INPUT).eventKey).not.toBe(serialized.eventKey);
  });

  test("topicForOutboxEvent routes task and notification handoffs without PGlite channel coupling", () => {
    expect(topicForOutboxEvent(EVENT_INPUT)).toBe("project.22222222-2222-4222-8222-222222222222.tasks");
    expect(topicForOutboxEvent({
      ...EVENT_INPUT,
      projectId: null,
      verb: "notification.created",
      subjectKind: "notification",
      subjectId: "notification-1",
    })).toBe(`org.${EVENT_INPUT.orgId}.notifications`);
  });
});

describe("application outbox worker contract", () => {
  test("worker uses configurable polling interval and pg-notify fast path", () => {
    const dispatcher: OutboxDispatcher = {
      eventBus: { publish() {} },
      search: { handleEvent: async () => {} },
      notifications: { handleEvent: async () => {} },
    };

    const worker = createOutboxWorker({
      dispatcher,
      pollingIntervalMs: 250,
      listenForNotify: async () => async () => {},
    });

    expect(worker.pollingIntervalMs).toBe(250);
    expect(worker.supportsNotifyFastPath).toBe(true);
  });
});

describe("application outbox CR-01 repeat-event dispatch", () => {
  test("CR-01 writes and dispatches two later events for one subject", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const baseEvent = {
        orgId: DEFAULT_ORG_ID,
        projectId: "22222222-2222-4222-8222-222222222222",
        verb: "task.updated",
        subjectKind: "task",
        subjectId: "33333333-3333-4333-8333-333333333333",
      };
      await writeOutboxEvent(em, { ...baseEvent, payload: { title: "first" } });
      await writeOutboxEvent(em, { ...baseEvent, payload: { title: "second" } });
      /* flushed */

      const rows = await em.find(DomainEventOutbox, {
        org: DEFAULT_ORG_ID,
        verb: "task.updated",
        subjectId: baseEvent.subjectId,
        processedAt: null,
      } as never);
      const published: unknown[] = [];
      const result = await dispatchPendingOutboxEvents(em, {
        eventBus: {
          publish(_topic, payload) {
            published.push(payload);
          },
        },
      });

      expect(rows).toHaveLength(2);
      expect(result.dispatched).toBe(2);
      expect(published).toHaveLength(2);
    } finally {
      await db.close();
    }
  });
});
