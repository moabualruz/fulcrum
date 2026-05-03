import { z } from "zod";

export const ChannelNameSchema = z.enum(["in-app", "email", "slack", "discord", "webhook", "push"]);

export const IdInputSchema = z.object({
  id: z.string().uuid().describe("Notification identifier."),
});

export const ListNotificationsInputSchema = z.object({
  unread: z.boolean().optional().describe("Filter to unread notifications."),
  limit: z.number().int().min(1).max(100).default(50).describe("Maximum notifications to return."),
  offset: z.number().int().min(0).default(0).describe("Pagination offset."),
});

export const SubjectInputSchema = z.object({
  subjectKind: z.string().min(1).describe("Notification subject type."),
  subjectId: z.string().uuid().describe("Notification subject identifier."),
});

export const MuteInputSchema = SubjectInputSchema.extend({
  mutedUntil: z.date().nullable().optional().describe("Mute expiry time, or null for indefinite mute."),
});

export const NotificationRuleCreateInputSchema = z.object({
  name: z.string().min(1).describe("Notification rule name."),
  subjectKind: z.string().min(1).nullable().optional().describe("Optional subject type scope."),
  eventPattern: z.record(z.string(), z.unknown()).describe("Event pattern matcher."),
  channels: z.array(ChannelNameSchema).min(1).default(["in-app"]).describe("Delivery channels."),
  enabled: z.boolean().default(true).describe("Whether rule is active."),
});

export const NotificationRuleUpdateInputSchema = z.object({
  id: z.string().uuid().describe("Notification rule identifier."),
  name: z.string().min(1).optional().describe("Notification rule name."),
  subjectKind: z.string().min(1).nullable().optional().describe("Optional subject type scope."),
  eventPattern: z.record(z.string(), z.unknown()).optional().describe("Event pattern matcher."),
  channels: z.array(ChannelNameSchema).min(1).optional().describe("Delivery channels."),
  enabled: z.boolean().optional().describe("Whether rule is active."),
});

export const QuietHoursSetInputSchema = z.object({
  tz: z.string().min(1).default("UTC").describe("IANA time zone."),
  startHour: z.number().int().min(0).max(23).describe("Quiet-hours start hour."),
  endHour: z.number().int().min(0).max(23).describe("Quiet-hours end hour."),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]).describe("Quiet-hours days of week."),
});

export type NotificationChannel = z.infer<typeof ChannelNameSchema>;
