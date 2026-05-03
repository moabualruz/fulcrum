import { z } from "zod";

export const ChannelNameSchema = z.enum(["in-app", "email", "slack", "discord", "webhook", "push"]);

export const IdInputSchema = z.object({
  id: z.string().uuid(),
});

export const ListNotificationsInputSchema = z.object({
  unread: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const SubjectInputSchema = z.object({
  subjectKind: z.string().min(1),
  subjectId: z.string().uuid(),
});

export const MuteInputSchema = SubjectInputSchema.extend({
  mutedUntil: z.date().nullable().optional(),
});

export const NotificationRuleCreateInputSchema = z.object({
  name: z.string().min(1),
  subjectKind: z.string().min(1).nullable().optional(),
  eventPattern: z.record(z.string(), z.unknown()),
  channels: z.array(ChannelNameSchema).min(1).default(["in-app"]),
  enabled: z.boolean().default(true),
});

export const NotificationRuleUpdateInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  subjectKind: z.string().min(1).nullable().optional(),
  eventPattern: z.record(z.string(), z.unknown()).optional(),
  channels: z.array(ChannelNameSchema).min(1).optional(),
  enabled: z.boolean().optional(),
});

export const QuietHoursSetInputSchema = z.object({
  tz: z.string().min(1).default("UTC"),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
});

export type NotificationChannel = z.infer<typeof ChannelNameSchema>;
