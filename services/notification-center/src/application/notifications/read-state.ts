import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type {
  AppContext,
  ListNotificationsInput,
  NotificationDto,
  NotificationListDto,
} from "@notification-center/domain/notification.ts";

export interface NotificationReadStateRecord {
  id: string;
  orgId: string;
  userId: string;
  ruleId: string | null;
  eventId: string;
  title: string;
  body: string;
  entityKind: string;
  entityId: string;
  readAt: Date | null;
  traceId: string | null;
  createdAt: Date;
}

export interface NotificationReadStateReader {
  listNotifications(input: {
    orgId: string;
    userId: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ items: NotificationReadStateRecord[]; total: number }>;
  countUnread(input: { orgId: string; userId: string }): Promise<number>;
  findNotificationById(id: string): Promise<NotificationReadStateRecord | null>;
}

export interface NotificationReadStateWriter extends NotificationReadStateReader {
  markRead(input: { orgId: string; userId: string; id: string }): Promise<NotificationReadStateRecord | null>;
  markAllRead(input: { orgId: string; userId: string }): Promise<{ count: number }>;
}

export async function listNotificationReadStates(
  reader: NotificationReadStateReader,
  ctx: AppContext,
  input: ListNotificationsInput = { limit: 50, offset: 0 },
): Promise<NotificationListDto> {
  const userId = requireNotificationUserId(ctx);
  const result = await reader.listNotifications({
    orgId: ctx.orgId,
    userId,
    unread: input.unread,
    limit: input.limit,
    offset: input.offset,
  });
  return {
    items: result.items.map(serializeNotificationReadState),
    total: result.total,
  };
}

export async function countUnreadNotifications(
  reader: NotificationReadStateReader,
  ctx: AppContext,
): Promise<number> {
  return await reader.countUnread({ orgId: ctx.orgId, userId: requireNotificationUserId(ctx) });
}

export async function getNotificationReadState(
  reader: NotificationReadStateReader,
  ctx: AppContext,
  id: string,
): Promise<NotificationDto> {
  const row = await reader.findNotificationById(id);
  if (!row) throw new AppNotFoundError(`Notification not found: ${id}`);
  if (row.orgId !== ctx.orgId || row.userId !== ctx.userId) {
    throw new AppForbiddenError("Notification is outside user scope.");
  }
  return serializeNotificationReadState(row);
}

export async function markNotificationReadState(
  writer: NotificationReadStateWriter,
  ctx: AppContext,
  id: string,
): Promise<NotificationDto> {
  const row = await writer.markRead({ orgId: ctx.orgId, userId: requireNotificationUserId(ctx), id });
  if (!row) throw new AppNotFoundError("Notification not found.");
  return serializeNotificationReadState(row);
}

export async function markAllNotificationReadStates(
  writer: NotificationReadStateWriter,
  ctx: AppContext,
): Promise<{ count: number }> {
  return await writer.markAllRead({ orgId: ctx.orgId, userId: requireNotificationUserId(ctx) });
}

export function serializeNotificationReadState(row: NotificationReadStateRecord): NotificationDto {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    ruleId: row.ruleId,
    eventId: row.eventId,
    title: row.title,
    body: row.body,
    entityKind: row.entityKind,
    entityId: row.entityId,
    read: row.readAt !== null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

function requireNotificationUserId(ctx: AppContext): string {
  if (!ctx.userId) throw new AppForbiddenError("Notification user scope is required.");
  return ctx.userId;
}
