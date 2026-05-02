/**
 * Zod schemas for the notifications domain.
 * Pillar 13 (notifications + webhooks) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Notification channel — Pillar 13 extends with delivery adapters. */
export const NotificationChannelSchema = z.enum(["in_app", "email", "slack", "webhook"]);

/** Minimal Notification output schema — Pillar 13 extends with delivery state. */
export const NotificationSchema = z.object({
  id: z.string().uuid().describe("Unique notification identifier."),
  orgId: z.string().uuid().describe("Organisation the notification belongs to."),
  title: z.string().describe("Short human-readable notification title."),
  channel: NotificationChannelSchema.describe("Delivery channel for the notification."),
  createdAt: z.date().describe("Timestamp when the notification was created."),
});

/** Input for listing notifications — Pillar 13 adds filters/pagination. */
export const ListNotificationsInputSchema = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
});

export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type ListNotificationsInput = z.infer<typeof ListNotificationsInputSchema>;
