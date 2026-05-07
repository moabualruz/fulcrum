/**
 * Zod schemas for the webhooks domain (Pillar 13, Issue 07).
 *
 * Shared across web, CLI, and TUI surfaces (C4).
 * Secret is NEVER returned to callers; list shows "****".
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

// ─── Event types ─────────────────────────────────────────────────────────────

/** Webhook event types — extendable catalog. */
export const WebhookEventTypeSchema = z.enum([
  "task.created",
  "task.updated",
  "task.completed",
  "run.started",
  "run.completed",
  "run.failed",
  "doc.created",
  "doc.updated",
  "sprint.started",
  "sprint.completed",
]);

// ─── Webhook ──────────────────────────────────────────────────────────────────

/** Input for creating a webhook. Secret is plain text; router encrypts it. */
export const WebhookInputSchema = z.object({
  name: z.string().min(1).max(255).describe("Human-readable webhook label (unique per org)."),
  url: z.string().url().describe("HTTPS destination for webhook events."),
  secret: z.string().min(1).max(1024).optional().describe("HMAC signing secret (plain text; stored encrypted)."),
  eventsFilter: z
    .array(WebhookEventTypeSchema)
    .min(1)
    .optional()
    .describe("Event types to deliver. Omit for all events."),
  enabled: z.boolean().optional().default(true).describe("When false, no deliveries are attempted."),
});

/** Input for updating a webhook. All fields optional except id (passed in body). */
export const WebhookUpdateInputSchema = z.object({
  id: z.string().uuid().describe("Webhook to update."),
  name: z.string().min(1).max(255).optional().describe("New human-readable label."),
  url: z.string().url().optional().describe("New HTTPS destination."),
  secret: z.string().min(1).max(1024).optional().describe("New HMAC signing secret (plain text; stored encrypted)."),
  eventsFilter: z.array(WebhookEventTypeSchema).min(1).optional().describe("Replacement event type filter."),
  enabled: z.boolean().optional().describe("Enable or disable the webhook."),
});

/** Output for a single webhook. Secret always masked. */
export const WebhookOutputSchema = z.object({
  id: z.string().uuid().describe("Unique webhook identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the webhook."),
  name: z.string().describe("Human-readable webhook label."),
  url: z.string().url().describe("HTTPS destination for webhook events."),
  secret: z.literal("****").describe("Secret is always masked in output."),
  eventsFilter: z.array(WebhookEventTypeSchema).nullable().describe("Event type filter. null = all events."),
  enabled: z.boolean().describe("Whether deliveries are attempted."),
  createdAt: z.date().describe("When the webhook was registered."),
  updatedAt: z.date().describe("When the webhook was last updated."),
  lastDeliveryAt: z.date().nullable().describe("Timestamp of most recent delivery attempt."),
});

// Backward-compat alias for existing consumers of the old stub schema.
export const WebhookSchema = WebhookOutputSchema;

// ─── Delivery ─────────────────────────────────────────────────────────────────

export const WebhookDeliveryStatusSchema = z.enum(["pending", "delivered", "failed", "retrying"]);

/** Output for a single delivery attempt. */
export const DeliveryOutputSchema = z.object({
  id: z.string().uuid().describe("Unique delivery attempt identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the webhook."),
  webhookId: z.string().uuid().describe("Webhook endpoint that received this delivery."),
  eventId: z.string().uuid().nullable().describe("Event that triggered the delivery. null for test-fire."),
  status: WebhookDeliveryStatusSchema.describe("Current delivery status."),
  attempt: z.number().int().positive().describe("Attempt counter (1-indexed)."),
  responseCode: z.number().int().nullable().describe("HTTP response status code from the destination."),
  error: z.string().nullable().describe("Error message on failure. null when successful."),
  nextRetryAt: z.date().nullable().describe("When the next retry is scheduled. null = no retry."),
  createdAt: z.date().describe("When this delivery attempt was created."),
});

// ─── List inputs ──────────────────────────────────────────────────────────────

export const ListWebhooksInputSchema = z
  .object({ orgId: z.string().uuid().optional().describe("Filter webhooks by organisation.") })
  .optional();

export const ListDeliveriesInputSchema = z.object({
  webhookId: z.string().uuid().describe("Webhook whose delivery log to retrieve."),
  limit: z.number().int().positive().max(200).optional().default(50).describe("Maximum number of deliveries to return (default 50)."),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type WebhookInput = z.infer<typeof WebhookInputSchema>;
export type WebhookUpdateInput = z.infer<typeof WebhookUpdateInputSchema>;
export type WebhookOutput = z.infer<typeof WebhookOutputSchema>;
export type Webhook = WebhookOutput;
export type DeliveryOutput = z.infer<typeof DeliveryOutputSchema>;
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;
export type ListWebhooksInput = z.infer<typeof ListWebhooksInputSchema>;
export type ListDeliveriesInput = z.infer<typeof ListDeliveriesInputSchema>;
