import { describe, expect, test } from "bun:test";

import {
  createOutboxWorker,
  serializeOutboxEvent,
  topicForOutboxEvent,
  type OutboxDispatcher,
  type OutboxEventInput,
} from "./outbox.ts";

const EVENT_INPUT: OutboxEventInput = {
  orgId: "00000000-0000-0000-0000-000000000001",
  projectId: "project-alpha",
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
    expect(serialized.eventKey).toBe("task.created:task:task-1");
  });

  test("topicForOutboxEvent routes task and notification handoffs without PGlite channel coupling", () => {
    expect(topicForOutboxEvent(EVENT_INPUT)).toBe("project.project-alpha.tasks");
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
