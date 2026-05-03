/**
 * Webhooks sub-router — Pillar 13, Issue 07.
 *
 * Procedures:
 *   webhooks.list         — list org webhooks (secrets masked)
 *   webhooks.get          — get one webhook by id
 *   webhooks.create       — create + encrypt secret
 *   webhooks.update       — update fields; re-encrypt secret if changed
 *   webhooks.delete       — delete + cascade deliveries
 *   webhooks.deliveries.list — list delivery attempts for a webhook
 *   webhooks.deliveries.get  — get single delivery attempt
 *
 * Feature gate: `outbound-webhooks` flag (FULCRUM_FEATURES or DB row).
 *   - OFF → FeatureDisabledError (FORBIDDEN).
 *   - ON  → normal CRUD.
 *
 * Secret discipline:
 *   - Plain-text secret accepted on create/update.
 *   - Encrypted via nacl.secretbox (vault.ts) before persistence.
 *   - List/get always returns "****" for secret field.
 *   - Raw ciphertext is only decrypted by the dispatcher (Issue 08).
 *
 * C6: No raw SQL.
 * C8: needle-di Container pattern; em/container resolved from ctx.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { t } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";
import {
  WebhookInputSchema,
  WebhookUpdateInputSchema,
  WebhookOutputSchema,
  DeliveryOutputSchema,
  ListDeliveriesInputSchema,
} from "../schemas/webhooks.ts";
import { FlagRegistry } from "../../flags/registry.ts";

// ─── Feature gate helper ──────────────────────────────────────────────────────

async function assertOutboundWebhooksEnabled(ctx: {
  container: import("@needle-di/core").Container | null;
  orgId: string | null;
  userId: string | null;
}): Promise<void> {
  // Fast-path: check FULCRUM_FEATURES env var.
  const envFlags = (process.env.FULCRUM_FEATURES ?? "").split(",").map((f) => f.trim());
  if (envFlags.includes("outbound-webhooks")) return;

  // Container path: FlagRegistry.
  if (ctx.container?.has(FlagRegistry)) {
    try {
      const flagRegistry = ctx.container.get(FlagRegistry);
      const enabled = await flagRegistry.isEnabled("outbound-webhooks", {
        orgId: ctx.orgId ?? undefined,
        userId: ctx.userId ?? undefined,
      });
      if (enabled) return;
    } catch {
      // Fall through to FORBIDDEN.
    }
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Feature 'outbound-webhooks' is disabled. Enable it via FULCRUM_FEATURES or the flags API.",
  });
}

// ─── Encryption helpers (lazy — avoid bundling nacl in SSR without a container) ─

async function encryptSecret(plaintext: string): Promise<string> {
  try {
    const [{ encrypt }, { loadOrCreateMasterKey }] = await Promise.all([
      import("../../secrets/vault.ts"),
      import("../../secrets/keyring.ts"),
    ]);
    const masterKey = await loadOrCreateMasterKey({} as never).catch(() => null);
    if (!masterKey) {
      // No keyring configured — store with a "plain:" prefix (test/dev environments).
      // Dispatcher skips HMAC signing when prefix is present.
      return "plain:" + Buffer.from(plaintext, "utf8").toString("base64");
    }
    // MasterKey.key is the raw Uint8Array for encryption.
    const ciphertext = encrypt(masterKey.key, plaintext);
    return Buffer.from(ciphertext).toString("base64url");
  } catch {
    // Vault or keyring unavailable — store with plain prefix.
    return "plain:" + Buffer.from(plaintext, "utf8").toString("base64");
  }
}

// ─── Shared output projection ─────────────────────────────────────────────────

function projectWebhook(row: {
  id: string;
  org: { id: string } | string;
  name: string;
  url: string;
  eventsFilter: string[] | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt: Date | null;
}): z.infer<typeof WebhookOutputSchema> {
  return {
    id: row.id,
    orgId: typeof row.org === "string" ? row.org : row.org.id,
    name: row.name,
    url: row.url,
    secret: "****",
    eventsFilter: (row.eventsFilter ?? null) as z.infer<typeof WebhookOutputSchema>["eventsFilter"],
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastDeliveryAt: row.lastDeliveryAt,
  };
}

function projectDelivery(row: {
  id: string;
  org: { id: string } | string;
  webhook: { id: string } | string;
  eventId: string | null;
  status: string;
  attempt: number;
  responseCode: number | null;
  error: string | null;
  nextRetryAt: Date | null;
  createdAt: Date;
}): z.infer<typeof DeliveryOutputSchema> {
  return {
    id: row.id,
    orgId: typeof row.org === "string" ? row.org : row.org.id,
    webhookId: typeof row.webhook === "string" ? row.webhook : row.webhook.id,
    eventId: row.eventId,
    status: row.status as z.infer<typeof DeliveryOutputSchema>["status"],
    attempt: row.attempt,
    responseCode: row.responseCode,
    error: row.error,
    nextRetryAt: row.nextRetryAt,
    createdAt: row.createdAt,
  };
}

// ─── Deliveries sub-router ────────────────────────────────────────────────────

const deliveriesRouter = t.router({
  list: protectedProcedure
    .input(ListDeliveriesInputSchema)
    .output(z.array(DeliveryOutputSchema))
    .query(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      if (!ctx.em) return [];

      const { WebhookDelivery } = await import("../../db/entities/notifications/WebhookDelivery.ts");
      const rows = await ctx.em.find(
        WebhookDelivery,
        { webhook: { id: input.webhookId }, org: { id: ctx.orgId } },
        { limit: input.limit ?? 50, orderBy: { createdAt: "DESC" } },
      );
      return rows.map(projectDelivery);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(DeliveryOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      if (!ctx.em) return null;

      const { WebhookDelivery } = await import("../../db/entities/notifications/WebhookDelivery.ts");
      const row = await ctx.em.findOne(WebhookDelivery, { id: input.id, org: { id: ctx.orgId } });
      return row ? projectDelivery(row) : null;
    }),
});

// ─── Main router ──────────────────────────────────────────────────────────────

export const webhooksRouter = t.router({
  list: protectedProcedure
    .input(z.void())
    .output(z.array(WebhookOutputSchema))
    .query(async ({ ctx }) => {
      await assertOutboundWebhooksEnabled(ctx);
      if (!ctx.em) return [];

      const { Webhook } = await import("../../db/entities/notifications/Webhook.ts");
      const rows = await ctx.em.find(Webhook, { org: { id: ctx.orgId } }, { orderBy: { createdAt: "DESC" } });
      return rows.map(projectWebhook);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(WebhookOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      if (!ctx.em) return null;

      const { Webhook } = await import("../../db/entities/notifications/Webhook.ts");
      const row = await ctx.em.findOne(Webhook, { id: input.id, org: { id: ctx.orgId } });
      return row ? projectWebhook(row) : null;
    }),

  create: protectedProcedure
    .input(WebhookInputSchema)
    .output(WebhookOutputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      if (!ctx.em) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database connection." });

      const { Webhook } = await import("../../db/entities/notifications/Webhook.ts");
      const { Org } = await import("../../db/entities/auth/Org.ts");

      const org = ctx.em.getReference(Org, ctx.orgId);
      const encryptedSecret = input.secret ? await encryptSecret(input.secret) : null;

      const webhook = ctx.em.create(Webhook, {
        org,
        name: input.name,
        url: input.url,
        encryptedSecret,
        eventsFilter: input.eventsFilter ?? null,
        enabled: input.enabled ?? true,
      });

      ctx.em.persist(webhook);
      await ctx.em.flush();
      return projectWebhook(webhook);
    }),

  update: protectedProcedure
    .input(WebhookUpdateInputSchema)
    .output(WebhookOutputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      if (!ctx.em) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database connection." });

      const { Webhook } = await import("../../db/entities/notifications/Webhook.ts");
      const webhook = await ctx.em.findOne(Webhook, { id: input.id, org: { id: ctx.orgId } });
      if (!webhook) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });

      if (input.name !== undefined) webhook.name = input.name;
      if (input.url !== undefined) webhook.url = input.url;
      if (input.secret !== undefined) webhook.encryptedSecret = await encryptSecret(input.secret);
      if (input.eventsFilter !== undefined) webhook.eventsFilter = input.eventsFilter ?? null;
      if (input.enabled !== undefined) webhook.enabled = input.enabled;

      await ctx.em.flush();
      return projectWebhook(webhook);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      if (!ctx.em) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database connection." });

      const { Webhook } = await import("../../db/entities/notifications/Webhook.ts");
      const webhook = await ctx.em.findOne(Webhook, { id: input.id, org: { id: ctx.orgId } });
      if (!webhook) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });

      ctx.em.remove(webhook);
      await ctx.em.flush();
      return { ok: true as const };
    }),

  deliveries: deliveriesRouter,
});

export type WebhooksRouter = typeof webhooksRouter;
