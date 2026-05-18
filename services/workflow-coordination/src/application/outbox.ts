import type { EntityManager } from "typeorm";
import { IsNull } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { Notification } from "@notification-center/infrastructure/database/entities/notifications/Notification.ts";
import { DomainEventOutbox } from "@platform-core/infrastructure/application-database/entities/platform/DomainEventOutbox.ts";

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
  schemaVersion: 1;
  eventType: string;
}

export interface OutboxConsumer {
  handleEvent(event: SerializedOutboxEvent): Promise<void>;
}

export interface OutboxDispatcher {
  eventBus: {
    publish(topic: string, payload: unknown): void;
  };
  search?: OutboxConsumer;
  notifications?: OutboxConsumer;
  audit?: OutboxConsumer;
  workflow?: OutboxConsumer;
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

export const OUTBOX_PGLITE_FALLBACK_BEHAVIOR =
  "PGlite dispatch uses polling after commit; LISTEN/NOTIFY fast path is unavailable, so delivery is at pollingIntervalMs latency.";

export const OUTBOX_CONSUMER_MAP = [
  { key: "eventBus", domain: "subscription", effect: "publish topic-scoped live update" },
  { key: "search", domain: "search", effect: "index mutated entity" },
  { key: "notifications", domain: "notification", effect: "fan out user-visible notification" },
  { key: "audit", domain: "audit", effect: "record audit-safe event reference" },
  { key: "workflow", domain: "workflow", effect: "advance workflow orchestration consumers" },
] as const;

const DEFAULT_MAX_DISPATCH_ATTEMPTS = 3;

export function serializeOutboxEvent(input: OutboxEventInput): SerializedOutboxEvent {
  const subjectId = input.subjectId ?? null;
  return {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    verb: input.verb,
    subjectKind: input.subjectKind,
    subjectId,
    payload: input.payload ?? {},
    eventKey: crypto.randomUUID(),
    schemaVersion: 1,
    eventType: input.verb,
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
  const existing = await em.findOne(DomainEventOutbox, { where: { eventKey: serialized.eventKey } as never });
  if (existing) return existing;

  const org = { id: serialized.orgId } as Org;
  const event = await em.save(em.create(Event, {
    org,
    projectId: serialized.projectId,
    verb: serialized.verb,
    subjectKind: serialized.subjectKind,
    subjectId: serialized.subjectId,
    payload: serialized.payload,
    createdAt: new Date(),
  } as never));
  const outbox = await em.save(em.create(DomainEventOutbox, {
    org,
    projectId: serialized.projectId,
    verb: serialized.verb,
    subjectKind: serialized.subjectKind,
    subjectId: serialized.subjectId,
    eventKey: serialized.eventKey,
    payload: serialized.payload,
  } as never));
  void event; // saved for audit trail
  return outbox;
}

export async function dispatchPendingOutboxEvents(
  em: EntityManager,
  dispatcher: OutboxDispatcher,
  options: { maxAttempts?: number } = {},
): Promise<{ dispatched: number; retried: number; deadLettered: number }> {
  const rows = await em.find(DomainEventOutbox, {
    where: { processedAt: IsNull() } as never,
    order: { createdAt: "ASC" },
  });
  let dispatched = 0;
  let retried = 0;
  let deadLettered = 0;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_DISPATCH_ATTEMPTS;

  for (const row of rows) {
    const event: SerializedOutboxEvent = {
      orgId: row.org.id,
      projectId: row.projectId ?? null,
      verb: row.verb,
      subjectKind: row.subjectKind,
      subjectId: row.subjectId ?? null,
      payload: row.payload,
      eventKey: row.eventKey,
      schemaVersion: 1,
      eventType: row.verb,
    };
    try {
      await dispatcher.search?.handleEvent(event);
      await dispatcher.notifications?.handleEvent(event);
      await dispatcher.audit?.handleEvent(event);
      await dispatcher.workflow?.handleEvent(event);
      dispatcher.eventBus.publish(topicForOutboxEvent(event), event);
      row.processedAt = new Date();
      row.attempts += 1;
      await em.save(row);
      dispatched += 1;
    } catch (error) {
      row.attempts += 1;
      row.payload = withOutboxFailure(row.payload, error, row.attempts, row.attempts >= maxAttempts);
      if (row.attempts >= maxAttempts) {
        row.processedAt = new Date();
        deadLettered += 1;
      } else {
        retried += 1;
      }
      await em.save(row);
    }
  }

  return { dispatched, retried, deadLettered };
}

function withOutboxFailure(
  payload: Record<string, unknown>,
  error: unknown,
  attempts: number,
  deadLettered: boolean,
): Record<string, unknown> {
  return {
    ...payload,
    _outbox: {
      attempts,
      deadLettered,
      lastError: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
    },
  };
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
    where: {
      org: { id: orgId },
      userId,
      readAt: IsNull(),
    } as never,
  });
}
