import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

import type { NotificationReadStateRecord } from "@notification-center/application/notifications/read-state.ts";
import type {
  NotificationChannelSettings,
  NotificationMute,
  NotificationQuietHoursSettings,
  NotificationRuleSettings,
} from "@notification-center/infrastructure/database/notification.entities.ts";
import {
  NotificationChannelSettingsEntity,
  NotificationMuteEntity,
  NotificationPushSubscriptionEntity,
  NotificationQuietHoursSettingsEntity,
  NotificationRuleSettingsEntity,
} from "@notification-center/infrastructure/database/notification.entities.ts";
import { NotificationReadStateStore } from "@notification-center/infrastructure/database/notification-read-state-store.ts";

const CHANNELS = [
  { name: "in-app", enabled: true, configurable: false },
  { name: "email", enabled: true, configurable: true },
  { name: "slack", enabled: true, configurable: true },
  { name: "discord", enabled: true, configurable: true },
  { name: "webhook", enabled: true, configurable: true },
  { name: "push", enabled: true, configurable: true },
] as const;

export interface NotificationPublicRow {
  id: string;
  orgId: string;
  userId: string;
  ruleId: string | null;
  eventId: string | null;
  title: string;
  body: string;
  entityKind: string;
  entityId: string;
  read: boolean;
  readAt: string | null;
  traceId: string;
  createdAt: string | null;
}

export interface NotificationRulePublicRow {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  subjectKind: string | null;
  active: boolean;
  eventPattern: Record<string, unknown>;
  channels: string[];
  enabled: boolean;
  deliveryMode: "immediate" | "digest" | "delayed";
  digestWindowSeconds: number | null;
  delaySeconds: number | null;
  critical: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NotificationQuietHoursPublicRow {
  id: string;
  orgId: string;
  userId: string;
  tz: string;
  startHour: number;
  endHour: number;
  daysOfWeek: number[];
}

export interface NotificationMutePublicRow {
  id: string;
  orgId: string;
  userId: string;
  subjectKind: string;
  subjectId: string;
  mutedUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NotificationSettingsPublicResponse {
  channels: Array<{ name: string; enabled: boolean; configurable: boolean; config?: Record<string, unknown> }>;
  rules: NotificationRulePublicRow[];
  quietHours: NotificationQuietHoursPublicRow | null;
  mutes: NotificationMutePublicRow[];
}

export class NotificationPublicStore {
  private readonly readState: NotificationReadStateStore;

  constructor(private readonly dataSource: DataSource) {
    this.readState = new NotificationReadStateStore(dataSource);
  }

  async listNotifications(input: {
    orgId: string;
    userId: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ data: NotificationPublicRow[] }> {
    const notifications = await this.readState.listNotifications({
      orgId: input.orgId,
      userId: input.userId,
      unread: input.unread,
      limit: input.limit,
      offset: input.offset,
    });

    return { data: notifications.items.map(toPublicRow) };
  }

  async markRead(input: { orgId: string; userId: string; id: string }): Promise<NotificationPublicRow | null> {
    const notification = await this.readState.markRead({
      orgId: input.orgId,
      userId: input.userId,
      id: input.id,
    });
    return notification ? toPublicRow(notification) : null;
  }

  async unreadCount(input: { orgId: string; userId: string }): Promise<{ count: number }> {
    return { count: await this.readState.countUnread(input) };
  }

  async markAllRead(input: { orgId: string; userId: string }): Promise<{ count: number }> {
    return await this.readState.markAllRead(input);
  }

  async getSettings(input: { orgId: string; userId: string }): Promise<NotificationSettingsPublicResponse> {
    const configuredChannels = await this.dataSource.getRepository(NotificationChannelSettingsEntity).find({
      where: { orgId: input.orgId, userId: input.userId },
    });
    return {
      channels: CHANNELS.map((channel) => {
        const configured = configuredChannels.find((candidate) => candidate.kind === channel.name);
        return {
          ...channel,
          enabled: configured?.enabled ?? channel.enabled,
          ...(configured ? { config: publicChannelConfig(configured.config) } : {}),
        };
      }),
      rules: await this.listRules(input),
      quietHours: await this.getQuietHours(input),
      mutes: await this.listMutes(input),
    };
  }

  async listRules(input: { orgId: string; userId: string }): Promise<NotificationRulePublicRow[]> {
    const rules = await this.dataSource.getRepository(NotificationRuleSettingsEntity).find({
      where: { orgId: input.orgId, userId: input.userId },
      order: { name: "ASC", id: "ASC" },
    });
    return rules.map(toRulePublicRow);
  }

  async getRule(input: { orgId: string; userId: string; id: string }): Promise<NotificationRulePublicRow | null> {
    const rule = await this.dataSource.getRepository(NotificationRuleSettingsEntity).findOne({
      where: { id: input.id, orgId: input.orgId, userId: input.userId },
    });
    return rule ? toRulePublicRow(rule) : null;
  }

  async createRule(input: {
    orgId: string;
    userId: string;
    name: string;
    subjectKind?: string | null;
    eventPattern?: Record<string, unknown>;
    channels?: string[];
    enabled?: boolean;
    deliveryMode?: "immediate" | "digest" | "delayed";
    digestWindowSeconds?: number | null;
    delaySeconds?: number | null;
    critical?: boolean;
  }): Promise<NotificationRulePublicRow> {
    const now = new Date();
    const eventPattern = withRuleTiming(input.eventPattern ?? {}, input);
    const rule = this.dataSource.getRepository(NotificationRuleSettingsEntity).create({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId,
      subjectKind: input.subjectKind ?? null,
      active: input.enabled ?? true,
      name: input.name,
      eventPattern,
      channels: input.channels ?? ["in-app"],
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return toRulePublicRow(await this.dataSource.getRepository(NotificationRuleSettingsEntity).save(rule));
  }

  async updateRule(input: {
    orgId: string;
    userId: string;
    id: string;
    name?: string;
    subjectKind?: string | null;
    eventPattern?: Record<string, unknown>;
    channels?: string[];
    enabled?: boolean;
    deliveryMode?: "immediate" | "digest" | "delayed";
    digestWindowSeconds?: number | null;
    delaySeconds?: number | null;
    critical?: boolean;
  }): Promise<NotificationRulePublicRow | null> {
    const repository = this.dataSource.getRepository(NotificationRuleSettingsEntity);
    const rule = await repository.findOne({
      where: { id: input.id, orgId: input.orgId, userId: input.userId },
    });
    if (!rule) return null;
    if (input.name !== undefined) rule.name = input.name;
    if (input.subjectKind !== undefined) rule.subjectKind = input.subjectKind;
    if (input.eventPattern !== undefined) rule.eventPattern = input.eventPattern;
    if (
      input.deliveryMode !== undefined ||
      input.digestWindowSeconds !== undefined ||
      input.delaySeconds !== undefined ||
      input.critical !== undefined
    ) {
      rule.eventPattern = withRuleTiming(rule.eventPattern ?? {}, input);
    }
    if (input.channels !== undefined) rule.channels = input.channels;
    if (input.enabled !== undefined) {
      rule.enabled = input.enabled;
      rule.active = input.enabled;
    }
    rule.updatedAt = new Date();
    return toRulePublicRow(await repository.save(rule));
  }

  async deleteRule(input: { orgId: string; userId: string; id: string }): Promise<{ ok: true }> {
    const repository = this.dataSource.getRepository(NotificationRuleSettingsEntity);
    const rule = await repository.findOne({
      where: { id: input.id, orgId: input.orgId, userId: input.userId },
    });
    if (rule) await repository.remove(rule);
    return { ok: true };
  }

  async getQuietHours(input: { orgId: string; userId: string }): Promise<NotificationQuietHoursPublicRow | null> {
    const quietHours = await this.dataSource.getRepository(NotificationQuietHoursSettingsEntity).findOne({
      where: { orgId: input.orgId, userId: input.userId },
    });
    return quietHours ? toQuietHoursPublicRow(quietHours) : null;
  }

  async setQuietHours(input: {
    orgId: string;
    userId: string;
    tz: string;
    startHour: number;
    endHour: number;
    daysOfWeek: number[];
  }): Promise<NotificationQuietHoursPublicRow> {
    const repository = this.dataSource.getRepository(NotificationQuietHoursSettingsEntity);
    const existing = await repository.findOne({
      where: { orgId: input.orgId, userId: input.userId },
    });
    const quietHours = existing ?? repository.create({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId,
      createdAt: new Date(),
    });
    quietHours.tz = input.tz;
    quietHours.startHour = input.startHour;
    quietHours.endHour = input.endHour;
    quietHours.daysOfWeek = input.daysOfWeek;
    quietHours.updatedAt = new Date();
    return toQuietHoursPublicRow(await repository.save(quietHours));
  }

  async listMutes(input: { orgId: string; userId: string }): Promise<NotificationMutePublicRow[]> {
    const mutes = await this.dataSource.getRepository(NotificationMuteEntity).find({
      where: { orgId: input.orgId, userId: input.userId },
      order: { subjectKind: "ASC", subjectId: "ASC" },
    });
    return mutes.map(toMutePublicRow);
  }

  async mute(input: {
    orgId: string;
    userId: string;
    subjectKind: string;
    subjectId: string;
    mutedUntil?: Date | string | null;
  }): Promise<NotificationMutePublicRow> {
    const repository = this.dataSource.getRepository(NotificationMuteEntity);
    const existing = await repository.findOne({
      where: {
        orgId: input.orgId,
        userId: input.userId,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
      },
    });
    const mute = existing ?? repository.create({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      createdAt: new Date(),
    });
    mute.mutedUntil = mutedUntilDate(input.mutedUntil);
    mute.updatedAt = new Date();
    return toMutePublicRow(await repository.save(mute));
  }

  async unmute(input: {
    orgId: string;
    userId: string;
    subjectKind: string;
    subjectId: string;
  }): Promise<{ ok: true }> {
    await this.dataSource.getRepository(NotificationMuteEntity).delete({
      orgId: input.orgId,
      userId: input.userId,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
    });
    return { ok: true };
  }

  async configureChannel(input: {
    orgId: string;
    userId: string;
    channel: string;
    enabled?: boolean;
    email?: string;
    token?: string;
    url?: string;
    secret?: string;
    subscription?: string | null;
  }): Promise<{ ok: true }> {
    const channelRepository = this.dataSource.getRepository(NotificationChannelSettingsEntity);
    const channel = await channelRepository.findOne({
      where: { orgId: input.orgId, userId: input.userId, kind: input.channel },
    }) ?? channelRepository.create({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId,
      kind: input.channel,
      createdAt: new Date(),
    });
    channel.enabled = input.enabled ?? true;
    channel.config = channelConfig(input);
    channel.updatedAt = new Date();
    await channelRepository.save(channel);

    if (input.channel !== "push" || !input.subscription) return { ok: true };
    const subscription = parsePushSubscription(input.subscription);
    const pushRepository = this.dataSource.getRepository(NotificationPushSubscriptionEntity);
    const existing = await pushRepository.findOne({
      where: {
        userId: input.userId,
        endpoint: subscription.endpoint,
      },
    });
    const row = existing ?? pushRepository.create({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId,
      endpoint: subscription.endpoint,
      createdAt: new Date(),
    });
    row.p256dh = subscription.keys.p256dh;
    row.auth = subscription.keys.auth;
    row.userAgent = subscription.userAgent ?? null;
    row.updatedAt = new Date();
    await pushRepository.save(row);
    return { ok: true };
  }
}

function toPublicRow(notification: NotificationReadStateRecord): NotificationPublicRow {
  return {
    id: notification.id,
    orgId: notification.orgId,
    userId: notification.userId,
    ruleId: notification.ruleId,
    eventId: notification.eventId,
    title: notification.title,
    body: notification.body,
    entityKind: notification.entityKind,
    entityId: notification.entityId,
    read: Boolean(notification.readAt),
    readAt: notification.readAt?.toISOString() ?? null,
    traceId: notification.traceId ?? notification.eventId,
    createdAt: notification.createdAt?.toISOString() ?? null,
  };
}

function toMutePublicRow(mute: NotificationMute): NotificationMutePublicRow {
  return {
    id: mute.id,
    orgId: mute.orgId,
    userId: mute.userId,
    subjectKind: mute.subjectKind,
    subjectId: mute.subjectId,
    mutedUntil: mute.mutedUntil?.toISOString() ?? null,
    createdAt: mute.createdAt?.toISOString() ?? null,
    updatedAt: mute.updatedAt?.toISOString() ?? null,
  };
}

function mutedUntilDate(value: Date | string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function toRulePublicRow(rule: NotificationRuleSettings): NotificationRulePublicRow {
  const timing = ruleTiming(rule.eventPattern ?? {});
  return {
    id: rule.id,
    orgId: rule.orgId,
    userId: rule.userId ?? "",
    name: rule.name ?? "",
    subjectKind: rule.subjectKind,
    active: rule.active,
    eventPattern: rule.eventPattern ?? {},
    channels: notificationChannels(rule.channels),
    enabled: rule.enabled,
    deliveryMode: timing.deliveryMode,
    digestWindowSeconds: timing.digestWindowSeconds,
    delaySeconds: timing.delaySeconds,
    critical: timing.critical,
    createdAt: rule.createdAt?.toISOString() ?? null,
    updatedAt: rule.updatedAt?.toISOString() ?? null,
  };
}

function toQuietHoursPublicRow(quietHours: NotificationQuietHoursSettings): NotificationQuietHoursPublicRow {
  return {
    id: quietHours.id,
    orgId: quietHours.orgId,
    userId: quietHours.userId,
    tz: quietHours.tz,
    startHour: quietHours.startHour,
    endHour: quietHours.endHour,
    daysOfWeek: quietHours.daysOfWeek.map(Number),
  };
}

function notificationChannels(channels: unknown): string[] {
  const allowed = new Set(CHANNELS.map((channel) => channel.name));
  const list = Array.isArray(channels)
    ? channels
    : typeof channels === "string"
      ? safeParseJsonArray(channels)
      : [];
  return list.filter((channel): channel is string => typeof channel === "string" && allowed.has(channel as never));
}

function safeParseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function channelConfig(input: {
  email?: string;
  token?: string;
  url?: string;
  secret?: string;
  subscription?: string | null;
}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      email: input.email,
      token: input.token,
      url: input.url,
      secret: input.secret,
      subscription: input.subscription,
    }).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function publicChannelConfig(config: NotificationChannelSettings["config"]): Record<string, unknown> {
  const redacted = { ...config };
  if (redacted["secret"]) {
    delete redacted["secret"];
    redacted["secretConfigured"] = true;
  }
  if (redacted["token"]) {
    delete redacted["token"];
    redacted["tokenConfigured"] = true;
  }
  if (redacted["subscription"]) {
    delete redacted["subscription"];
    redacted["subscriptionConfigured"] = true;
  }
  return redacted;
}

function ruleTiming(pattern: Record<string, unknown>): {
  deliveryMode: "immediate" | "digest" | "delayed";
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

function parsePushSubscription(subscription: string): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
} {
  const parsed = JSON.parse(subscription) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  if (!parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys.auth) {
    throw new Error("Push subscription is incomplete.");
  }
  return {
    endpoint: parsed.endpoint,
    keys: { p256dh: parsed.keys.p256dh, auth: parsed.keys.auth },
    userAgent: parsed.userAgent,
  };
}
