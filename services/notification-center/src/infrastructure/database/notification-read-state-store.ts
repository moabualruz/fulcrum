import { DataSource, IsNull, type FindManyOptions, type FindOptionsWhere } from "typeorm";

import type {
  NotificationReadStateReader,
  NotificationReadStateRecord,
  NotificationReadStateWriter,
} from "@notification-center/application/notifications/read-state.ts";
import {
  type NotificationReadState,
  NotificationReadStateEntity,
} from "@notification-center/infrastructure/database/notification.entities.ts";

export class NotificationReadStateStore implements NotificationReadStateWriter {
  constructor(private readonly dataSource: DataSource) {}

  async listNotifications(input: {
    orgId: string;
    userId: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ items: NotificationReadStateRecord[]; total: number }> {
    const where: FindOptionsWhere<NotificationReadState> = {
      orgId: input.orgId,
      userId: input.userId,
    };
    if (input.unread) where.readAt = IsNull();

    const options: FindManyOptions<NotificationReadState> = {
      where,
      order: { createdAt: "DESC", id: "ASC" },
    };
    if (input.limit !== undefined) options.take = input.limit;
    if (input.offset !== undefined) options.skip = input.offset;

    const [items, total] = await this.repository().findAndCount(options);
    return { items: items.map(toReadStateRecord), total };
  }

  async countUnread(input: { orgId: string; userId: string }): Promise<number> {
    return await this.repository().countBy({
      orgId: input.orgId,
      userId: input.userId,
      readAt: IsNull(),
    });
  }

  async findNotificationById(id: string): Promise<NotificationReadStateRecord | null> {
    const row = await this.repository().findOneBy({ id });
    return row ? toReadStateRecord(row) : null;
  }

  async markRead(input: { orgId: string; userId: string; id: string }): Promise<NotificationReadStateRecord | null> {
    const row = await this.repository().findOneBy({
      id: input.id,
      orgId: input.orgId,
      userId: input.userId,
    });
    if (!row) return null;
    if (row.readAt === null) {
      row.readAt = new Date();
      return toReadStateRecord(await this.repository().save(row));
    }
    return toReadStateRecord(row);
  }

  async markAllRead(input: { orgId: string; userId: string }): Promise<{ count: number }> {
    const result = await this.repository().update({
      orgId: input.orgId,
      userId: input.userId,
      readAt: IsNull(),
    }, { readAt: new Date() });
    return { count: result.affected ?? 0 };
  }

  private repository() {
    return this.dataSource.getRepository(NotificationReadStateEntity);
  }
}

function toReadStateRecord(row: NotificationReadState): NotificationReadStateRecord {
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
    readAt: row.readAt,
    traceId: row.traceId,
    createdAt: row.createdAt,
  };
}

export type { NotificationReadStateReader };
