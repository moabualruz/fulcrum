export class NotificationListQueryDto {
  orgId!: string;
  userId!: string;
  unread?: boolean | string;
  limit?: number | string;
  offset?: number | string;
}

export class NotificationMarkReadParamsDto {
  id!: string;
}

export class NotificationChannelParamsDto {
  channel!: string;
}

export class NotificationChannelConfigBodyDto {
  enabled?: boolean;
  email?: string;
  token?: string;
  url?: string;
  secret?: string;
  subscription?: string;
}

export class NotificationRuleParamsDto {
  id!: string;
}

export class NotificationRuleCreateBodyDto {
  name!: string;
  subjectKind?: string | null;
  eventPattern?: Record<string, unknown>;
  channels?: string[];
  enabled?: boolean;
  deliveryMode?: "immediate" | "digest" | "delayed";
  digestWindowSeconds?: number | null;
  delaySeconds?: number | null;
  critical?: boolean;
}

export class NotificationRulePatchBodyDto {
  name?: string;
  subjectKind?: string | null;
  eventPattern?: Record<string, unknown>;
  channels?: string[];
  enabled?: boolean;
  deliveryMode?: "immediate" | "digest" | "delayed";
  digestWindowSeconds?: number | null;
  delaySeconds?: number | null;
  critical?: boolean;
}

export class NotificationQuietHoursSetBodyDto {
  tz!: string;
  startHour!: number;
  endHour!: number;
  daysOfWeek!: number[];
}

export class NotificationMuteParamsDto {
  subjectKind!: string;
  subjectId!: string;
}

export class NotificationMuteBodyDto {
  subjectKind!: string;
  subjectId!: string;
  mutedUntil?: string | null;
}

export class NotificationListResponseDto {
  data!: unknown[];
}

export class NotificationUnreadCountResponseDto {
  count!: number;
}

export class NotificationMarkAllReadResponseDto {
  count!: number;
}

export class NotificationSettingsResponseDto {
  channels!: unknown[];
  rules!: unknown[];
  quietHours!: unknown | null;
  mutes!: unknown[];
}
