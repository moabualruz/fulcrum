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
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string(),
  channel: NotificationChannelSchema,
  createdAt: z.date(),
});

/** Input for listing notifications — Pillar 13 adds filters/pagination. */
export const ListNotificationsInputSchema = z.object({
  orgId: z.string().uuid().optional(),
});

export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type ListNotificationsInput = z.infer<typeof ListNotificationsInputSchema>;
