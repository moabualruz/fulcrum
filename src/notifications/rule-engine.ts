import { injectable } from "@needle-di/core";

import {
  DeliveryStatus,
  type NotificationRule,
} from "../db/entities/notifications/index.ts";

export type NotificationChannel =
  | "in-app"
  | "email"
  | "webhook"
  | "slack"
  | "discord"
  | "push";

export interface NotificationEventLike {
  id: string;
  orgId?: string;
  org?: { id?: string } | string;
  verb: string;
  subjectKind: string;
  subjectId?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface EvaluateRulesContext {
  orgId: string;
  currentUserId?: string;
  now?: Date;
}

export interface RuleMatch {
  rule: NotificationRuleLike;
  userId: string;
  channels: NotificationChannel[];
  notification?: unknown;
  deliveries: unknown[];
}

export interface NotificationRuleLike {
  id: string;
  orgId?: string;
  org?: { id?: string } | string;
  userId: string | null;
  enabled?: boolean;
  active?: boolean;
  name?: string | null;
  eventPattern?: Record<string, unknown> | null;
  channels?: string[] | null;
}

export interface NotificationRuleEngineRepositories {
  notificationRuleRepo: {
    find(where: Record<string, unknown>): Promise<NotificationRuleLike[]>;
  };
  notificationMuteRepo: {
    findOne(where: Record<string, unknown>): Promise<NotificationMuteLike | null | undefined>;
  };
  notificationRepo?: {
    create(data: Record<string, unknown>): Promise<unknown>;
  };
  notificationDeliveryRepo?: {
    create(data: Record<string, unknown>): Promise<unknown>;
  };
  featureFlags?: {
    isEnabled(flag: string, ctx?: { orgId?: string; userId?: string }): Promise<boolean>;
  };
}

interface NotificationMuteLike {
  orgId?: string;
  org?: { id?: string } | string;
  userId: string;
  subjectKind: string;
  subjectId: string;
  mutedUntil?: Date | string | null;
}

interface PayloadPathEquals {
  path: string;
  value: unknown;
}

const CHANNEL_FLAGS: Partial<Record<NotificationChannel, string>> = {
  email: "notify-email",
  webhook: "notify-webhook",
  slack: "notify-slack",
  discord: "notify-discord",
  push: "notify-push",
};

export async function evaluateRules(
  event: NotificationEventLike,
  ctx: EvaluateRulesContext,
  repositories: NotificationRuleEngineRepositories,
): Promise<RuleMatch[]> {
  return new NotificationRuleEngine().evaluate(event, ctx, repositories);
}

export class NotificationRuleEngine {
  async evaluate(
    event: NotificationEventLike,
    ctx: EvaluateRulesContext,
    repositories: NotificationRuleEngineRepositories,
  ): Promise<RuleMatch[]> {
    if (eventOrgId(event) !== ctx.orgId) return [];

    const rules = await repositories.notificationRuleRepo.find({
      orgId: ctx.orgId,
      enabled: true,
    });
    const matches: RuleMatch[] = [];
    const now = ctx.now ?? new Date();

    for (const rule of rules) {
      const ruleOrgId = scopedOrgId(rule);
      if (ruleOrgId && ruleOrgId !== ctx.orgId) continue;
      if (rule.enabled === false || rule.active === false || !rule.userId) continue;
      if (!matchesPattern(rule, event)) continue;
      if (await isMuted(repositories, ctx.orgId, rule.userId, event, now)) continue;

      const channels = await enabledChannels(rule.channels, repositories, {
        orgId: ctx.orgId,
        userId: rule.userId,
      });
      if (channels.length === 0) continue;

      const notification = channels.includes("in-app") && repositories.notificationRepo
        ? await repositories.notificationRepo.create(notificationData(rule, event, ctx.orgId))
        : undefined;
      const deliveries = [];
      for (const channel of channels) {
        if (!repositories.notificationDeliveryRepo) continue;
        deliveries.push(await repositories.notificationDeliveryRepo.create(
          deliveryData(rule, event, ctx.orgId, channel, notification),
        ));
      }

      matches.push({ rule, userId: rule.userId, channels, notification, deliveries });
    }

    return matches;
  }
}

injectable()(NotificationRuleEngine);

function matchesPattern(rule: NotificationRuleLike, event: NotificationEventLike): boolean {
  const pattern = rule.eventPattern ?? {};
  const subjectKind = pattern["subject_kind"];
  if (typeof subjectKind === "string" && subjectKind !== event.subjectKind) return false;

  const verb = pattern["verb"];
  if (typeof verb === "string" && verb !== event.verb) return false;

  const projectId = pattern["project_id"];
  if (projectId !== undefined && projectId !== payloadAt(event.payload, "project_id")) return false;

  const sprintId = pattern["sprint_id"];
  if (sprintId !== undefined && sprintId !== payloadAt(event.payload, "sprint_id")) return false;

  const payloadPathEq = pattern["payload_path_eq"];
  if (!Array.isArray(payloadPathEq)) return true;

  return payloadPathEq.every((entry) => {
    if (!isPayloadPathEquals(entry)) return false;
    const expected = entry.value === "$current_user_id" ? rule.userId : entry.value;
    return payloadAt(event.payload, entry.path) === expected;
  });
}

async function enabledChannels(
  requestedChannels: string[] | null | undefined,
  repositories: NotificationRuleEngineRepositories,
  ctx: { orgId: string; userId: string },
): Promise<NotificationChannel[]> {
  const channels = requestedChannels?.length ? requestedChannels : ["in-app"];
  const enabled: NotificationChannel[] = [];

  for (const channel of channels) {
    if (!isNotificationChannel(channel)) continue;
    if (channel === "in-app") {
      enabled.push(channel);
      continue;
    }
    const flag = CHANNEL_FLAGS[channel];
    if (!flag) continue;
    if (await repositories.featureFlags?.isEnabled(flag, ctx) === true) {
      enabled.push(channel);
    }
  }

  return enabled;
}

async function isMuted(
  repositories: NotificationRuleEngineRepositories,
  orgId: string,
  userId: string,
  event: NotificationEventLike,
  now: Date,
): Promise<boolean> {
  if (!event.subjectId) return false;
  const mute = await repositories.notificationMuteRepo.findOne({
    orgId,
    userId,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId,
  });
  if (!mute) return false;
  if (scopedOrgId(mute) && scopedOrgId(mute) !== orgId) return false;
  if (mute.mutedUntil == null) return true;
  return new Date(mute.mutedUntil).getTime() > now.getTime();
}

function notificationData(
  rule: NotificationRuleLike,
  event: NotificationEventLike,
  orgId: string,
): Record<string, unknown> {
  return {
    orgId,
    userId: rule.userId,
    ruleId: rule.id,
    eventId: event.id,
    title: `${event.verb} ${event.subjectKind}`,
    body: "",
    entityKind: event.subjectKind,
    entityId: event.subjectId ?? event.id,
  };
}

function deliveryData(
  rule: NotificationRuleLike,
  event: NotificationEventLike,
  orgId: string,
  channel: NotificationChannel,
  notification: unknown,
): Record<string, unknown> {
  return {
    orgId,
    ruleId: rule.id,
    notificationId: objectId(notification),
    userId: rule.userId,
    channel,
    status: DeliveryStatus.Pending,
    attemptCount: 0,
    payload: {
      eventId: event.id,
      subjectKind: event.subjectKind,
      subjectId: event.subjectId ?? null,
      verb: event.verb,
    },
  };
}

function payloadAt(payload: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!payload) return undefined;
  return path.split(".").reduce<unknown>((value, segment) => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, payload);
}

function isPayloadPathEquals(value: unknown): value is PayloadPathEquals {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as PayloadPathEquals).path === "string" &&
    "value" in value;
}

function isNotificationChannel(value: string): value is NotificationChannel {
  return value === "in-app" ||
    value === "email" ||
    value === "webhook" ||
    value === "slack" ||
    value === "discord" ||
    value === "push";
}

function eventOrgId(event: NotificationEventLike): string | undefined {
  return scopedOrgId(event);
}

function scopedOrgId(value: { orgId?: string; org?: { id?: string } | string }): string | undefined {
  if (value.orgId) return value.orgId;
  if (typeof value.org === "string") return value.org;
  return value.org?.id;
}

function objectId(value: unknown): string | null {
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}
