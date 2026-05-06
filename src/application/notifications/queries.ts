import type { EntityManager } from "@mikro-orm/postgresql";
import { Notification } from "../../db/entities/notifications/Notification.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, NotificationDto } from "./types.ts";

export async function listNotifications(em: EntityManager, ctx: AppContext, input: { unread?: boolean } = {}): Promise<NotificationDto[]> {
  const rows = await em.find(Notification, { org: ctx.orgId, userId: ctx.userId, ...(input.unread ? { readAt: null } : {}) } as never, { orderBy: { createdAt: "DESC", id: "ASC" } });
  return rows.map(serializeNotification);
}

export async function getNotification(em: EntityManager, ctx: AppContext, id: string): Promise<NotificationDto> {
  const row = await em.findOne(Notification, { id } as never);
  if (!row) throw new AppNotFoundError(`Notification not found: ${id}`);
  if (row.org.id !== ctx.orgId || row.userId !== ctx.userId) throw new AppForbiddenError("Notification is outside user scope.");
  return serializeNotification(row);
}

export function serializeNotification(row: Notification): NotificationDto {
  return { id: row.id, orgId: row.org.id, userId: row.userId, title: row.title, read: row.readAt !== null };
}
