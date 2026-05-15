export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }

export type NotificationChannel = "in-app" | "email" | "slack" | "discord" | "webhook" | "push";
export type NotificationDeliveryMode = "immediate" | "digest" | "delayed";

export interface NotificationDto {
  id: string;
  orgId: string;
  userId: string;
  ruleId: string | null;
  eventId: string;
  title: string;
  body: string;
  entityKind: string;
  entityId: string;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationListDto {
  items: NotificationDto[];
  total: number;
}

export interface NotificationRuleDto {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  subjectKind: string | null;
  active: boolean;
  eventPattern: Record<string, unknown>;
  channels: NotificationChannel[];
  enabled: boolean;
  deliveryMode: NotificationDeliveryMode;
  digestWindowSeconds: number | null;
  delaySeconds: number | null;
  critical: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationMuteDto {
  id: string;
  orgId: string;
  userId: string;
  subjectKind: string;
  subjectId: string;
  mutedUntil: Date | null;
}

export interface NotificationQuietHoursDto {
  id: string;
  orgId: string;
  userId: string;
  tz: string;
  startHour: number;
  endHour: number;
  daysOfWeek: number[];
}

export interface CreateNotificationInput { eventId: string; entityKind: string; entityId: string; title: string; body?: string }

export interface ListNotificationsInput { unread?: boolean; limit: number; offset: number }

export interface NotificationRuleCreateInput {
  name: string;
  subjectKind?: string | null;
  eventPattern: Record<string, unknown>;
  channels: NotificationChannel[];
  enabled: boolean;
  deliveryMode?: NotificationDeliveryMode;
  digestWindowSeconds?: number | null;
  delaySeconds?: number | null;
  critical?: boolean;
}

export interface NotificationRuleUpdateInput {
  id: string;
  name?: string;
  subjectKind?: string | null;
  eventPattern?: Record<string, unknown>;
  channels?: NotificationChannel[];
  enabled?: boolean;
  deliveryMode?: NotificationDeliveryMode;
  digestWindowSeconds?: number | null;
  delaySeconds?: number | null;
  critical?: boolean;
}

export interface NotificationSubjectInput {
  subjectKind: string;
  subjectId: string;
}

export interface NotificationMuteInput extends NotificationSubjectInput {
  mutedUntil?: Date | null;
}

export interface PushSubscriptionConfigInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export interface QuietHoursSetInput {
  tz: string;
  startHour: number;
  endHour: number;
  daysOfWeek: number[];
}
