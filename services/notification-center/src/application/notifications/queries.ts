import type { EntityManager } from "@mikro-orm/postgresql";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import {
  Notification,
  NotificationMute,
  NotificationQuietHours,
  NotificationRule,
} from "@platform-core/infrastructure/application-database/entities/notifications/index.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type {
  AppContext,
  ListNotificationsInput,
  NotificationDto,
  NotificationListDto,
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationMuteDto,
  NotificationQuietHoursDto,
  NotificationRuleDto,
} from "@notification-center/domain/notification.ts";

export interface DefaultNotificationRuleInput {
  name: string;
  subjectKind: string | null;
  eventPattern: Record<string, unknown>;
}

export async function listNotifications(
  em: EntityManager,
  ctx: AppContext,
  input: ListNotificationsInput = { limit: 50, offset: 0 },
): Promise<NotificationListDto> {
  const rows = await em.findAndCount(
    Notification,
    { org: ctx.orgId, userId: ctx.userId, ...(input.unread ? { readAt: null } : {}) } as never,
    { limit: input.limit, offset: input.offset, orderBy: { createdAt: "DESC", id: "ASC" } },
  );
  return { items: rows[0].map(serializeNotification), total: rows[1] };
}

export async function countRecentNotifications(
  em: EntityManager,
  ctx: AppContext,
  input: { since: Date },
): Promise<number> {
  return await em.count(Event, {
    org: ctx.orgId,
    createdAt: { $gte: input.since },
  } as never);
}

export async function getNotification(em: EntityManager, ctx: AppContext, id: string): Promise<NotificationDto> {
  const row = await em.findOne(Notification, { id } as never);
  if (!row) throw new AppNotFoundError(`Notification not found: ${id}`);
  if (row.org.id !== ctx.orgId || row.userId !== ctx.userId) throw new AppForbiddenError("Notification is outside user scope.");
  return serializeNotification(row);
}

export function serializeNotification(row: Notification): NotificationDto {
  return {
    id: row.id,
    orgId: row.org.id,
    userId: row.userId ?? "",
    ruleId: row.ruleId ?? null,
    eventId: row.eventId,
    title: row.title,
    body: row.body,
    entityKind: row.entityKind,
    entityId: row.entityId,
    read: row.readAt !== null,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
  };
}

export async function unreadNotificationCount(em: EntityManager, ctx: AppContext): Promise<number> {
  return em.count(Notification, { org: ctx.orgId, userId: ctx.userId, readAt: null } as never);
}

export async function seedDefaultNotificationRules(
  userId: string,
  orgId: string,
  em: EntityManager,
  rules: readonly DefaultNotificationRuleInput[],
  channels: string[],
): Promise<void> {
  const now = new Date();
  const org = em.getReference((await import("@platform-core/infrastructure/application-database/entities/auth/Org.ts")).Org, orgId);

  for (const rule of rules) {
    let existing: NotificationRule | null;
    try {
      existing = await em.findOne(NotificationRule, {
        userId,
        name: rule.name,
      } as never);
    } catch (error) {
      if (isMissingNotificationRuleColumns(error)) return;
      throw error;
    }
    if (existing) continue;
    em.persist(em.create(NotificationRule, {
      org,
      userId,
      subjectKind: rule.subjectKind,
      active: true,
      name: rule.name,
      eventPattern: rule.eventPattern,
      channels,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }));
  }
  await em.flush();
}

export async function listNotificationMutes(em: EntityManager, ctx: AppContext): Promise<NotificationMuteDto[]> {
  const rows = await em.find(NotificationMute, { org: ctx.orgId, userId: ctx.userId } as never, { orderBy: { subjectKind: "ASC" } });
  return rows.map(serializeMute);
}

export async function listNotificationRules(em: EntityManager, ctx: AppContext): Promise<NotificationRuleDto[]> {
  const rows = await em.find(NotificationRule, { org: ctx.orgId, userId: ctx.userId } as never, { orderBy: { name: "ASC" } });
  return rows.map(serializeRule);
}

export async function getNotificationRule(em: EntityManager, ctx: AppContext, id: string): Promise<NotificationRuleDto | null> {
  const row = await em.findOne(NotificationRule, { id, org: ctx.orgId, userId: ctx.userId } as never);
  return row ? serializeRule(row) : null;
}

export async function getNotificationQuietHours(
  em: EntityManager,
  ctx: AppContext,
): Promise<NotificationQuietHoursDto | null> {
  const row = await em.findOne(NotificationQuietHours, { org: ctx.orgId, userId: ctx.userId } as never);
  return row ? serializeQuietHours(row) : null;
}

export function serializeRule(row: NotificationRule): NotificationRuleDto {
  const timing = ruleTiming(row.eventPattern ?? {});
  return {
    id: row.id,
    orgId: row.org.id,
    userId: row.userId ?? "",
    name: row.name ?? "",
    subjectKind: row.subjectKind ?? null,
    active: row.active,
    eventPattern: row.eventPattern ?? {},
    channels: notificationChannels(row.channels),
    enabled: row.enabled,
    deliveryMode: timing.deliveryMode,
    digestWindowSeconds: timing.digestWindowSeconds,
    delaySeconds: timing.delaySeconds,
    critical: timing.critical,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
  };
}

function notificationChannels(channels: string[] | null): NotificationChannel[] {
  const allowed = new Set<NotificationChannel>(["in-app", "email", "slack", "discord", "webhook", "push"]);
  return (channels ?? []).filter((channel): channel is NotificationChannel =>
    allowed.has(channel as NotificationChannel)
  );
}

function isMissingNotificationRuleColumns(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { cause?: unknown; code?: unknown; message?: unknown };
  const message = String(candidate.message ?? "");
  if (
    (candidate.code === "42703" || message.includes("does not exist")) &&
    (message.includes("notification_rules") || message.includes("n0")) &&
    message.includes("user_id")
  ) {
    return true;
  }
  return isMissingNotificationRuleColumns(candidate.cause);
}

export function serializeMute(row: NotificationMute): NotificationMuteDto {
  return {
    id: row.id,
    orgId: row.org.id,
    userId: row.userId,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    mutedUntil: row.mutedUntil ?? null,
  };
}

export function serializeQuietHours(row: NotificationQuietHours): NotificationQuietHoursDto {
  return {
    id: row.id,
    orgId: row.org.id,
    userId: row.userId,
    tz: row.tz,
    startHour: row.startHour,
    endHour: row.endHour,
    daysOfWeek: (row.daysOfWeek ?? []).map(Number),
  };
}

export function ruleTiming(pattern: Record<string, unknown>): {
  deliveryMode: NotificationDeliveryMode;
  digestWindowSeconds: number | null;
  delaySeconds: number | null;
  critical: boolean;
} {
  const deliveryMode = pattern["deliveryMode"] === "digest" || pattern["deliveryMode"] === "delayed"
    ? pattern["deliveryMode"]
    : "immediate";
  return {
    deliveryMode,
    digestWindowSeconds: typeof pattern["digestWindowSeconds"] === "number" ? pattern["digestWindowSeconds"] : null,
    delaySeconds: typeof pattern["delaySeconds"] === "number" ? pattern["delaySeconds"] : null,
    critical: pattern["critical"] === true,
  };
}
