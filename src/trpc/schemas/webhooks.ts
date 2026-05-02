/**
 * Zod schemas for the webhooks domain.
 * Pillar 13 (notifications + webhooks) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Webhook event types — Pillar 13 extends with full event catalog. */
export const WebhookEventTypeSchema = z.enum([
  "task.created",
  "task.updated",
  "task.completed",
  "run.started",
  "run.completed",
  "run.failed",
]);

/** Minimal Webhook output schema — Pillar 13 extends with signing + delivery state. */
export const WebhookSchema = z.object({
  id: z.string().uuid().describe("Unique webhook identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the webhook."),
  name: z.string().describe("Human-readable webhook name."),
  url: z.string().url().describe("HTTPS endpoint that receives webhook events."),
  createdAt: z.date().describe("Timestamp when the webhook was registered."),
});

/** Input for listing webhooks — Pillar 13 adds filters/pagination. */
export const ListWebhooksInputSchema = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
});

export type Webhook = z.infer<typeof WebhookSchema>;
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;
export type ListWebhooksInput = z.infer<typeof ListWebhooksInputSchema>;
