import type { EntityManager } from "@mikro-orm/postgresql";
import { Org } from "../../db/entities/auth/Org.ts";
import { Event } from "../../db/entities/core/Event.ts";
import { Notification } from "../../db/entities/notifications/Notification.ts";
import { AppValidationError } from "../errors.ts";
import { getNotification, serializeNotification } from "./queries.ts";
import type { AppContext, CreateNotificationInput, NotificationDto } from "./types.ts";

export async function createNotification(em: EntityManager, ctx: AppContext, input: CreateNotificationInput): Promise<NotificationDto> {
  if (!ctx.userId || !input.eventId || !input.entityKind || !input.entityId || !input.title) throw new AppValidationError("Notification user, eventId, entityKind, entityId, and title are required.");
  return await em.transactional(async (txEm) => {
    const event = await txEm.findOne(Event, { id: input.eventId } as never) ??
      txEm.create(Event, {
        id: input.eventId,
        org: txEm.getReference(Org, ctx.orgId),
        verb: "notification.created",
        subjectKind: input.entityKind,
        subjectId: input.entityId,
        payload: {},
        createdAt: new Date(),
      });
    txEm.persist(event);
    await txEm.flush();
    const row = txEm.create(Notification, { org: txEm.getReference(Org, ctx.orgId), userId: ctx.userId!, eventId: input.eventId, entityKind: input.entityKind, entityId: input.entityId, title: input.title, body: input.body ?? "" });
    txEm.persist(row);
    await txEm.flush();
    return serializeNotification(row);
  });
}

export async function markNotificationRead(em: EntityManager, ctx: AppContext, id: string): Promise<NotificationDto> {
  return await em.transactional(async (txEm) => {
    const row = await txEm.findOne(Notification, { id } as never);
    if (!row) return await getNotification(txEm, ctx, id);
    row.readAt = new Date();
    txEm.persist(row);
    await txEm.flush();
    return getNotification(txEm, ctx, id);
  });
}
