import type { EntityManager } from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import {
  Notification,
  NotificationMute,
  NotificationQuietHours,
  NotificationRule,
  PushSubscription,
} from "@notification-center/infrastructure/database/entities/notifications/index.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { writeOutboxEvent } from "@workflow-coordination/application/outbox.ts";
import { getNotification, getNotificationRule, serializeMute, serializeNotification, serializeQuietHours, serializeRule } from "@notification-center/application/notifications/queries.ts";
import type {
  AppContext,
  CreateNotificationInput,
  NotificationDto,
  NotificationMuteDto,
  NotificationMuteInput,
  NotificationRuleCreateInput,
  NotificationRuleDto,
  NotificationRuleUpdateInput,
  NotificationSubjectInput,
  PushSubscriptionConfigInput,
  QuietHoursSetInput,
} from "@notification-center/domain/notification.ts";

async function writeNotificationOutboxEvent(
  em: EntityManager,
  input: Parameters<typeof writeOutboxEvent>[1],
): Promise<void> {
  try {
    await writeOutboxEvent(em, input);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Metadata for entity DomainEventOutbox not found")) {
      return;
    }
    throw error;
  }
}

export async function createNotification(em: EntityManager, ctx: AppContext, input: CreateNotificationInput): Promise<NotificationDto> {
  if (!ctx.userId || !input.eventId || !input.entityKind || !input.entityId || !input.title) throw new AppValidationError("Notification user, eventId, entityKind, entityId, and title are required.");
  return await em.transaction(async (txEm: EntityManager) => {
    const event = await txEm.findOne(Event, { where: { id: input.eventId } as never }) ??
      txEm.create(Event, {
        id: input.eventId,
        org: { id: ctx.orgId } as Org,
        verb: "notification.created",
        subjectKind: input.entityKind,
        subjectId: input.entityId,
        payload: {},
        createdAt: new Date(),
      });
    await txEm.save(event);
    const row = txEm.create(Notification, { org: { id: ctx.orgId } as Org, userId: ctx.userId!, eventId: input.eventId, entityKind: input.entityKind, entityId: input.entityId, title: input.title, body: input.body ?? "" });
    await txEm.save(row);
    return serializeNotification(row);
  });
}

export async function markNotificationRead(em: EntityManager, ctx: AppContext, id: string): Promise<NotificationDto> {
  return await em.transaction(async (txEm: EntityManager) => {
    const row = await txEm.findOne(Notification, { where: { id, org: ctx.orgId, userId: ctx.userId } as never });
    if (!row) throw new AppNotFoundError("Notification not found.");
    if (row.readAt !== null) return serializeNotification(row);
    row.readAt = new Date();
    await txEm.save(row);
    await writeNotificationOutboxEvent(txEm, {
      orgId: ctx.orgId,
      verb: "notification.read",
      subjectKind: "notification",
      subjectId: id,
      payload: { userId: ctx.userId },
    });
    return getNotification(txEm, ctx, id);
  });
}

export async function markAllNotificationsRead(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ count: number }> {
  return em.transaction(async (txEm: EntityManager) => {
    const rows = await txEm.find(Notification, { org: ctx.orgId, userId: ctx.userId, readAt: null } as never);
    const now = new Date();
    for (const row of rows) {
      row.readAt = now;
      await txEm.save(row);
    }
    if (rows.length > 0) {
      await writeNotificationOutboxEvent(txEm, {
        orgId: ctx.orgId,
        verb: "notification.read_all",
        subjectKind: "notification",
        subjectId: ctx.userId,
        payload: { count: rows.length },
      });
    }
    return { count: rows.length };
  });
}

export async function muteNotificationSubject(
  em: EntityManager,
  ctx: AppContext,
  input: NotificationMuteInput,
): Promise<NotificationMuteDto> {
  return em.transaction(async (txEm: EntityManager) => {
    const existing = await txEm.findOne(NotificationMute, { where: {
      org: ctx.orgId,
      userId: ctx.userId,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
    } as never });
    const row = existing ?? txEm.create(NotificationMute, {
      org: { id: ctx.orgId } as Org,
      userId: ctx.userId!,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
    });
    row.mutedUntil = input.mutedUntil ?? null;
    await txEm.save(row);
    await writeNotificationOutboxEvent(txEm, {
      orgId: ctx.orgId,
      verb: "notification.muted",
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      payload: { userId: ctx.userId, mutedUntil: row.mutedUntil?.toISOString() ?? null },
    });
    return serializeMute(row);
  });
}

export async function unmuteNotificationSubject(
  em: EntityManager,
  ctx: AppContext,
  input: NotificationSubjectInput,
): Promise<{ ok: true }> {
  return em.transaction(async (txEm: EntityManager) => {
    const row = await txEm.findOne(NotificationMute, { where: {
      org: ctx.orgId,
      userId: ctx.userId,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
    } as never });
    if (row) txEm.remove(row);
    await writeNotificationOutboxEvent(txEm, {
      orgId: ctx.orgId,
      verb: "notification.unmuted",
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      payload: { userId: ctx.userId },
    });
    return { ok: true };
  });
}

function withRuleTiming(
  pattern: Record<string, unknown>,
  input: {
    deliveryMode?: "immediate" | "digest" | "delayed";
    digestWindowSeconds?: number | null;
    delaySeconds?: number | null;
    critical?: boolean;
  },
): Record<string, unknown> {
  const next = { ...pattern };
  if (input.deliveryMode !== undefined) next["deliveryMode"] = input.deliveryMode;
  if (input.digestWindowSeconds !== undefined) {
    if (input.digestWindowSeconds === null) delete next["digestWindowSeconds"];
    else next["digestWindowSeconds"] = input.digestWindowSeconds;
  }
  if (input.delaySeconds !== undefined) {
    if (input.delaySeconds === null) delete next["delaySeconds"];
    else next["delaySeconds"] = input.delaySeconds;
  }
  if (input.critical !== undefined) next["critical"] = input.critical;
  if (next["deliveryMode"] === "digest" && next["digestWindowSeconds"] === undefined) next["digestWindowSeconds"] = 300;
  return next;
}

export async function createNotificationRule(
  em: EntityManager,
  ctx: AppContext,
  input: NotificationRuleCreateInput,
): Promise<NotificationRuleDto> {
  const now = new Date();
  const eventPattern = withRuleTiming(input.eventPattern, input);
  const row = em.create(NotificationRule, {
    org: { id: ctx.orgId } as Org,
    userId: ctx.userId!,
    name: input.name,
    subjectKind: input.subjectKind ?? null,
    active: input.enabled,
    eventPattern,
    channels: input.channels,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  });
  await em.save(row);
  await writeNotificationOutboxEvent(em, {
    orgId: ctx.orgId,
    verb: "notification.rule_created",
    subjectKind: "notification_rule",
    subjectId: row.id,
    payload: { userId: ctx.userId },
  });
  return serializeRule(row);
}

export async function updateNotificationRule(
  em: EntityManager,
  ctx: AppContext,
  input: NotificationRuleUpdateInput,
): Promise<NotificationRuleDto> {
  const row = await em.findOne(NotificationRule, { where: { id: input.id, org: ctx.orgId, userId: ctx.userId } as never });
  if (!row) throw new AppNotFoundError("Notification rule not found.");
  if (input.name !== undefined) row.name = input.name;
  if (input.subjectKind !== undefined) row.subjectKind = input.subjectKind;
  if (input.eventPattern !== undefined) row.eventPattern = input.eventPattern;
  if (
    input.deliveryMode !== undefined ||
    input.digestWindowSeconds !== undefined ||
    input.delaySeconds !== undefined ||
    input.critical !== undefined
  ) {
    row.eventPattern = withRuleTiming(row.eventPattern ?? {}, input);
  }
  if (input.channels !== undefined) row.channels = input.channels;
  if (input.enabled !== undefined) {
    row.enabled = input.enabled;
    row.active = input.enabled;
  }
  row.updatedAt = new Date();
  await writeNotificationOutboxEvent(em, {
    orgId: ctx.orgId,
    verb: "notification.rule_updated",
    subjectKind: "notification_rule",
    subjectId: row.id,
    payload: { userId: ctx.userId },
  });
  return serializeRule(row);
}

export async function deleteNotificationRule(
  em: EntityManager,
  ctx: AppContext,
  id: string,
): Promise<{ ok: true }> {
  const row = await em.findOne(NotificationRule, { where: { id, org: ctx.orgId, userId: ctx.userId } as never });
  if (row) em.remove(row);
  await writeNotificationOutboxEvent(em, {
    orgId: ctx.orgId,
    verb: "notification.rule_deleted",
    subjectKind: "notification_rule",
    subjectId: id,
    payload: { userId: ctx.userId },
  });
  return { ok: true };
}

export async function upsertPushSubscription(
  em: EntityManager,
  ctx: AppContext,
  input: PushSubscriptionConfigInput,
): Promise<{ ok: true }> {
  const existing = await em.findOne(PushSubscription, { where: {
    org: ctx.orgId,
    userId: ctx.userId,
    endpoint: input.endpoint,
  } as never });
  const row = existing ?? em.create(PushSubscription, {
    org: { id: ctx.orgId } as Org,
    userId: ctx.userId!,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  });
  row.userAgent = input.userAgent ?? null;
  await em.save(row);
  await writeNotificationOutboxEvent(em, {
    orgId: ctx.orgId,
    verb: "notification.push_configured",
    subjectKind: "notification_channel",
    subjectId: row.id,
    payload: { userId: ctx.userId, endpoint: input.endpoint },
  });
  return { ok: true };
}

export async function requireNotificationRule(
  em: EntityManager,
  ctx: AppContext,
  id: string,
): Promise<NotificationRuleDto> {
  const row = await getNotificationRule(em, ctx, id);
  if (!row) throw new AppNotFoundError("Notification rule not found.");
  return row;
}

export async function setNotificationQuietHours(
  em: EntityManager,
  ctx: AppContext,
  input: QuietHoursSetInput,
) {
  const row = await em.findOne(NotificationQuietHours, { where: { org: ctx.orgId, userId: ctx.userId } as never }) ??
    em.create(NotificationQuietHours, {
      org: { id: ctx.orgId } as Org,
      userId: ctx.userId!,
      startHour: input.startHour,
      endHour: input.endHour,
    });
  row.tz = input.tz;
  row.startHour = input.startHour;
  row.endHour = input.endHour;
  row.daysOfWeek = input.daysOfWeek;
  await em.save(row);
  await writeNotificationOutboxEvent(em, {
    orgId: ctx.orgId,
    verb: "notification.quiet_hours_set",
    subjectKind: "notification_settings",
    subjectId: ctx.userId,
    payload: { tz: input.tz, startHour: input.startHour, endHour: input.endHour },
  });
  return serializeQuietHours(row);
}
