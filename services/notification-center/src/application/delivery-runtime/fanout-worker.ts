import {
  evaluateRules,
  type NotificationChannel,
  type NotificationEventLike,
  type NotificationRuleEngineRepositories,
  type RuleMatch,
} from "./rule-engine.ts";
import { DeliveryStatus } from "@notification-center/infrastructure/database/entities/notifications/index.ts";
import type { WorkerRegistry } from "@platform-core/application/jobs/registry.ts";
import { assertRecordPayload, assertStringField } from "@platform-core/application/jobs/registry.ts";

export const NOTIFY_FANOUT_TASK = "notify-fan-out";

export interface NotifyFanoutPayload {
  eventId: string;
  internalQueueToken?: string;
}

export interface NotifyFanoutQueue {
  addJob(name: string, payload: Record<string, unknown>): Promise<unknown>;
}

export interface NotificationQuietHoursLike {
  orgId?: string;
  org?: { id?: string } | string;
  userId: string;
  tz?: string | null;
  startHour: number;
  endHour: number;
  daysOfWeek?: number[] | null;
}

export interface NotifyFanoutRepositories {
  eventRepo: {
    findOneOrFail(id: string): Promise<NotificationEventLike>;
  };
  notificationRuleRepo: NotificationRuleEngineRepositories["notificationRuleRepo"];
  notificationMuteRepo: NotificationRuleEngineRepositories["notificationMuteRepo"];
  featureFlags?: NotificationRuleEngineRepositories["featureFlags"];
  notificationRepo: {
    upsertFromMatch(match: RuleMatch, event: NotificationEventLike): Promise<unknown>;
  };
  notificationDeliveryRepo?: {
    upsertFromMatch?(
      match: RuleMatch,
      event: NotificationEventLike,
      channel: NotificationChannel,
      notification: unknown,
      status: DeliveryStatus.Pending | "held-quiet-hours",
    ): Promise<unknown>;
    create(data: Record<string, unknown>): Promise<unknown>;
  };
  notificationQuietHoursRepo: {
    findOne(where: Record<string, unknown>): Promise<NotificationQuietHoursLike | null | undefined>;
  };
  queue: NotifyFanoutQueue;
}

export interface NotifyFanoutOptions {
  now?: Date;
  internalQueueToken?: string;
}

export type NotifyFanoutTask = (payload: NotifyFanoutPayload) => Promise<void>;

export function createNotifyFanoutTask(
  repositories: NotifyFanoutRepositories,
  options: NotifyFanoutOptions = {},
): NotifyFanoutTask {
  return async (payload) => notifyFanout(payload, repositories, options);
}

export async function notifyFanout(
  payload: NotifyFanoutPayload,
  repositories: NotifyFanoutRepositories,
  options: NotifyFanoutOptions = {},
): Promise<void> {
  assertInternalQueueToken(payload, options);
  const event = await repositories.eventRepo.findOneOrFail(payload.eventId);
  const orgId = eventOrgId(event);
  if (!orgId) throw new Error(`notify-fan-out event ${payload.eventId} has no orgId`);
  assertCanonicalEvent(event);

  const matches = await evaluateRules(event, { orgId, now: options.now }, evaluationRepositories(repositories));
  const now = options.now ?? new Date();

  for (const match of matches) {
    const notification = match.channels.includes("in-app")
      ? await repositories.notificationRepo.upsertFromMatch(match, event)
      : undefined;

    for (const channel of match.channels) {
      await enqueueDeliveryOrQuietRetry(repositories, match, event, channel, notification, now);
    }
  }
}

function evaluationRepositories(
  repositories: NotifyFanoutRepositories,
): NotificationRuleEngineRepositories {
  return {
    notificationRuleRepo: repositories.notificationRuleRepo,
    notificationMuteRepo: repositories.notificationMuteRepo,
    featureFlags: repositories.featureFlags,
  };
}

export async function enqueueNotifyFanout(
  queue: NotifyFanoutQueue,
  eventId: string,
  internalQueueToken?: string,
): Promise<void> {
  await queue.addJob(NOTIFY_FANOUT_TASK, {
    eventId,
    ...(internalQueueToken ? { internalQueueToken } : {}),
  });
}

export function assertNotifyFanoutPayload(payload: unknown): asserts payload is NotifyFanoutPayload {
  assertRecordPayload(payload, NOTIFY_FANOUT_TASK);
  assertStringField(payload, "eventId", NOTIFY_FANOUT_TASK);
}

function assertInternalQueueToken(payload: NotifyFanoutPayload, options: NotifyFanoutOptions): void {
  if (!options.internalQueueToken) return;
  if (payload.internalQueueToken !== options.internalQueueToken) {
    throw new Error(`${NOTIFY_FANOUT_TASK} invalid internal queue token`);
  }
}

function assertCanonicalEvent(event: NotificationEventLike): void {
  const eventType = event.eventType ?? event.verb;
  if (!eventType) throw new Error(`notify-fan-out event ${event.id} has no eventType`);
  if (!event.subjectKind) throw new Error(`notify-fan-out event ${event.id} has no subjectKind`);
  if (event.subjectId == null || event.subjectId === "") {
    throw new Error(`notify-fan-out event ${event.id} has no subjectId`);
  }
}

export function registerNotifyFanoutWorkerTask(
  registry: WorkerRegistry,
  repositories: NotifyFanoutRepositories,
  options: NotifyFanoutOptions = {},
): void {
  registry.registerTask(NOTIFY_FANOUT_TASK, assertNotifyFanoutPayload, createNotifyFanoutTask(repositories, options));
}

async function enqueueDeliveryOrQuietRetry(
  repositories: NotifyFanoutRepositories,
  match: RuleMatch,
  event: NotificationEventLike,
  channel: NotificationChannel,
  notification: unknown,
  now: Date,
): Promise<void> {
  if (channel === "in-app") {
    if (!repositories.notificationDeliveryRepo?.upsertFromMatch) return;
    await createDelivery(repositories, match, event, channel, notification, DeliveryStatus.Pending);
    return;
  }

  const quietHours = await repositories.notificationQuietHoursRepo.findOne({
    orgId: eventOrgId(event),
    userId: match.userId,
  });
  const payload = deliveryPayload(match, event, channel, notification);

  if (quietHours && isInQuietHours(quietHours, now)) {
    await createDelivery(repositories, match, event, channel, notification, "held-quiet-hours");
    await repositories.queue.addJob("notify-retry-after-quiet", payload);
    return;
  }

  await createDelivery(repositories, match, event, channel, notification, DeliveryStatus.Pending);
  await repositories.queue.addJob(deliveryJobName(channel), payload);
}

async function createDelivery(
  repositories: NotifyFanoutRepositories,
  match: RuleMatch,
  event: NotificationEventLike,
  channel: NotificationChannel,
  notification: unknown,
  status: DeliveryStatus.Pending | "held-quiet-hours",
): Promise<void> {
  if (!repositories.notificationDeliveryRepo) return;
  if (repositories.notificationDeliveryRepo.upsertFromMatch) {
    await repositories.notificationDeliveryRepo.upsertFromMatch(match, event, channel, notification, status);
    return;
  }
  await repositories.notificationDeliveryRepo.create({
    orgId: eventOrgId(event),
    ruleId: match.rule.id,
    notificationId: objectId(notification),
    userId: match.userId,
    channel,
    status,
    attemptCount: 0,
    idempotencyKey: deliveryIdempotencyKey(match, event, channel),
    payload: {
      eventId: event.id,
      eventType: event.verb,
      subjectKind: event.subjectKind,
      subjectId: event.subjectId ?? null,
      verb: event.verb,
    },
  });
}

function deliveryIdempotencyKey(match: RuleMatch, event: NotificationEventLike, channel: NotificationChannel): string {
  return `${event.id}:${match.rule.id}:${match.userId}:${channel}`;
}

function deliveryPayload(
  match: RuleMatch,
  event: NotificationEventLike,
  channel: Exclude<NotificationChannel, "in-app">,
  notification: unknown,
): Record<string, unknown> {
  return {
    orgId: eventOrgId(event),
    eventId: event.id,
    ruleId: match.rule.id,
    userId: match.userId,
    channel,
    notificationId: objectId(notification),
  };
}

function deliveryJobName(channel: Exclude<NotificationChannel, "in-app">): string {
  return `notify-deliver-${channel}`;
}

function isInQuietHours(quietHours: NotificationQuietHoursLike, now: Date): boolean {
  const parts = timeParts(now, quietHours.tz || "UTC");
  const days = quietHours.daysOfWeek?.length ? quietHours.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(parts.weekday)) return false;

  if (quietHours.startHour === quietHours.endHour) return true;
  if (quietHours.startHour < quietHours.endHour) {
    return parts.hour >= quietHours.startHour && parts.hour < quietHours.endHour;
  }
  return parts.hour >= quietHours.startHour || parts.hour < quietHours.endHour;
}

function timeParts(now: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? now.getUTCHours());
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  return { hour, weekday: weekdayIndex(weekdayName) };
}

function weekdayIndex(value: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}

function eventOrgId(event: NotificationEventLike): string | undefined {
  if (event.orgId) return event.orgId;
  if (typeof event.org === "string") return event.org;
  return event.org?.id;
}

function objectId(value: unknown): string | null {
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}
