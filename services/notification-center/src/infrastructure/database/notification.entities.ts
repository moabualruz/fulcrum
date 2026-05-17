import { EntitySchema } from "typeorm";

export interface NotificationReadState {
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

export interface NotificationRuleSettings {
  id: string;
  orgId: string;
  userId: string | null;
  subjectKind: string | null;
  active: boolean;
  name: string | null;
  eventPattern: Record<string, unknown> | null;
  channels: string[] | null;
  enabled: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface NotificationQuietHoursSettings {
  id: string;
  orgId: string;
  userId: string;
  tz: string;
  startHour: number;
  endHour: number;
  daysOfWeek: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPushSubscription {
  id: string;
  orgId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationChannelSettings {
  id: string;
  orgId: string;
  userId: string | null;
  kind: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationMute {
  id: string;
  orgId: string;
  userId: string;
  subjectKind: string;
  subjectId: string;
  mutedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const NotificationReadStateEntity = new EntitySchema<NotificationReadState>({
  name: "NotificationReadState",
  tableName: "user_notifications",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid" },
    ruleId: { name: "rule_id", type: "uuid", nullable: true },
    eventId: { name: "event_id", type: "uuid" },
    title: { type: "varchar", length: 255 },
    body: { type: "text", default: "" },
    entityKind: { name: "entity_kind", type: "varchar", length: 255 },
    entityId: { name: "entity_id", type: "uuid" },
    readAt: { name: "read_at", type: "timestamptz", nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160, nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  indices: [
    { name: "idx_user_notifications_org_user_read", columns: ["orgId", "userId", "readAt"] },
    { name: "idx_user_notifications_org_user_created", columns: ["orgId", "userId", "createdAt"] },
    { name: "idx_user_notifications_trace", columns: ["traceId"] },
  ],
});

export const NotificationRuleSettingsEntity = new EntitySchema<NotificationRuleSettings>({
  name: "NotificationRuleSettings",
  tableName: "notification_rules",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid", nullable: true },
    subjectKind: { name: "subject_kind", type: "varchar", length: 255, nullable: true },
    active: { type: "boolean", default: true },
    name: { type: "varchar", length: 255, nullable: true },
    eventPattern: { name: "event_pattern", type: "jsonb", nullable: true },
    channels: { type: "text", array: true, nullable: true },
    enabled: { type: "boolean", default: true },
    createdAt: { name: "created_at", type: "timestamptz", nullable: true },
    updatedAt: { name: "updated_at", type: "timestamptz", nullable: true },
  },
  indices: [
    { name: "notification_rules_org_user", columns: ["orgId", "userId"] },
    { name: "notification_rules_org_enabled", columns: ["orgId", "enabled"] },
  ],
  uniques: [
    { name: "uq_notification_rules_user_name", columns: ["userId", "name"] },
  ],
});

export const NotificationQuietHoursSettingsEntity = new EntitySchema<NotificationQuietHoursSettings>({
  name: "NotificationQuietHoursSettings",
  tableName: "notification_quiet_hours",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid" },
    tz: { type: "varchar", length: 255, default: "'UTC'" },
    startHour: { name: "start_hour", type: "integer" },
    endHour: { name: "end_hour", type: "integer" },
    daysOfWeek: { name: "days_of_week", type: "integer", array: true, default: () => "ARRAY[0,1,2,3,4,5,6]" },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  uniques: [
    { name: "uq_notification_quiet_hours_user", columns: ["userId"] },
  ],
});

export const NotificationPushSubscriptionEntity = new EntitySchema<NotificationPushSubscription>({
  name: "NotificationPushSubscription",
  tableName: "push_subscriptions",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid" },
    endpoint: { type: "text" },
    p256dh: { type: "text" },
    auth: { type: "text" },
    userAgent: { name: "user_agent", type: "text", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  uniques: [
    { name: "uq_push_subscriptions_user_endpoint", columns: ["userId", "endpoint"] },
  ],
});

export const NotificationChannelSettingsEntity = new EntitySchema<NotificationChannelSettings>({
  name: "NotificationChannelSettings",
  tableName: "notification_channels",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid", nullable: true },
    kind: { type: "varchar", length: 64 },
    enabled: { type: "boolean", default: true },
    config: { type: "jsonb", default: {} },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  uniques: [
    { name: "uq_notification_channels_org_user_kind", columns: ["orgId", "userId", "kind"] },
  ],
  indices: [
    { name: "idx_notification_channels_org_user", columns: ["orgId", "userId"] },
  ],
});

export const NotificationMuteEntity = new EntitySchema<NotificationMute>({
  name: "NotificationMute",
  tableName: "notification_mutes",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid" },
    subjectKind: { name: "subject_kind", type: "varchar", length: 255 },
    subjectId: { name: "subject_id", type: "varchar", length: 255 },
    mutedUntil: { name: "muted_until", type: "timestamptz", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  uniques: [
    { name: "uq_notification_mutes_org_user_subject", columns: ["orgId", "userId", "subjectKind", "subjectId"] },
  ],
  indices: [
    { name: "idx_notification_mutes_org_user", columns: ["orgId", "userId"] },
  ],
});

export const NOTIFICATION_CENTER_ENTITIES = [
  NotificationReadStateEntity,
  NotificationRuleSettingsEntity,
  NotificationQuietHoursSettingsEntity,
  NotificationPushSubscriptionEntity,
  NotificationChannelSettingsEntity,
  NotificationMuteEntity,
];
