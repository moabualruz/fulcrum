import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../db/entities/auth/Org.ts";
import { Event } from "../db/entities/core/Event.ts";
import { Notification } from "../db/entities/notifications/Notification.ts";
import { DomainEventOutbox } from "../db/entities/platform/DomainEventOutbox.ts";

export interface OutboxEventInput {
  orgId: string;
  projectId?: string | null;
  verb: string;
  subjectKind: string;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
}

export interface SerializedOutboxEvent extends Required<Omit<OutboxEventInput, "projectId" | "subjectId" | "payload">> {
  projectId: string | null;
  subjectId: string | null;
  payload: Record<string, unknown>;
  eventKey: string;
}

export interface OutboxDispatcher {
  eventBus: {
    publish(topic: string, payload: unknown): void;
  };
  search?: {
    handleEvent(event: SerializedOutboxEvent): Promise<void>;
  };
  notifications?: {
    handleEvent(event: SerializedOutboxEvent): Promise<void>;
  };
}

export interface OutboxWorkerOptions {
  em?: EntityManager;
  dispatcher: OutboxDispatcher;
  pollingIntervalMs?: number;
  listenForNotify?: (
    channel: string,
    handler: () => Promise<void>,
  ) => Promise<() => Promise<void>>;
}

export interface OutboxWorker {
  pollingIntervalMs: number;
  supportsNotifyFastPath: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function serializeOutboxEvent(input: OutboxEventInput): SerializedOutboxEvent {
  const subjectId = input.subjectId ?? null;
  return {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    verb: input.verb,
    subjectKind: input.subjectKind,
    subjectId,
    payload: input.payload ?? {},
    eventKey: `${input.verb}:${input.subjectKind}:${subjectId ?? "none"}`,
  };
}

export function topicForOutboxEvent(input: OutboxEventInput): string {
  if (input.verb.startsWith("notification.") || input.subjectKind === "notification") {
    return `org.${input.orgId}.notifications`;
  }
  if (input.projectId) return `project.${input.projectId}.tasks`;
  return `org.${input.orgId}.events`;
}

export async function writeOutboxEvent(
  em: EntityManager,
  input: OutboxEventInput,
): Promise<DomainEventOutbox> {
  const serialized = serializeOutboxEvent(input);
  const org = em.getReference(Org, serialized.orgId);
  const existing = await em.findOne(DomainEventOutbox, { eventKey: serialized.eventKey } as never);
  if (existing) return existing;

  const event = em.create(Event, {
    org,
    projectId: serialized.projectId,
    verb: serialized.verb,
    subjectKind: serialized.subjectKind,
    subjectId: serialized.subjectId,
    payload: serialized.payload,
    createdAt: new Date(),
  });
  const outbox = em.create(DomainEventOutbox, {
    org,
    projectId: serialized.projectId,
    verb: serialized.verb,
    subjectKind: serialized.subjectKind,
    subjectId: serialized.subjectId,
    eventKey: serialized.eventKey,
    payload: serialized.payload,
  });
  em.persist([event, outbox]);
  await em.flush();
  return outbox;
}

export async function dispatchPendingOutboxEvents(
  em: EntityManager,
  dispatcher: OutboxDispatcher,
): Promise<{ dispatched: number }> {
  const rows = await em.find(
    DomainEventOutbox,
    { processedAt: null } as never,
    { orderBy: { createdAt: "ASC" } },
  );
  let dispatched = 0;

  for (const row of rows) {
    const event = serializeOutboxEvent({
      orgId: row.org.id,
      projectId: row.projectId ?? null,
      verb: row.verb,
      subjectKind: row.subjectKind,
      subjectId: row.subjectId ?? null,
      payload: row.payload,
    });
    dispatcher.eventBus.publish(topicForOutboxEvent(event), event);
    await dispatcher.search?.handleEvent(event);
    await dispatcher.notifications?.handleEvent(event);
    row.processedAt = new Date();
    row.attempts += 1;
    em.persist(row);
    dispatched += 1;
  }

  if (dispatched > 0) await em.flush();
  return { dispatched };
}

export function createOutboxWorker(options: OutboxWorkerOptions): OutboxWorker {
  const pollingIntervalMs = options.pollingIntervalMs ?? 1_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => Promise<void>) | null = null;

  async function runOnce(): Promise<void> {
    if (!options.em) return;
    await dispatchPendingOutboxEvents(options.em, options.dispatcher);
  }

  return {
    pollingIntervalMs,
    supportsNotifyFastPath: Boolean(options.listenForNotify),
    async start() {
      timer ??= setInterval(() => {
        void runOnce();
      }, pollingIntervalMs);
      if (options.listenForNotify && !unsubscribe) {
        unsubscribe = await options.listenForNotify("domain_event_outbox", runOnce);
      }
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await unsubscribe?.();
      unsubscribe = null;
    },
  };
}

export async function getUnreadNotificationCount(
  em: EntityManager,
  orgId: string,
  userId: string,
): Promise<number> {
  return await em.count(Notification, {
    org: orgId,
    userId,
    readAt: null,
  } as never);
}
