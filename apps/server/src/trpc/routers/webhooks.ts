/**
 * Webhooks sub-router — thin tRPC adapter over application webhooks services.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { appErrorToTrpcError } from "@/application/error-mapping.ts";
import { AppError, AppNotFoundError } from "@/application/errors.ts";
import {
  createWebhook,
  deleteWebhook,
  updateWebhook,
} from "@/application/webhooks/commands.ts";
import {
  getWebhook,
  getWebhookDelivery,
  listWebhookDeliveries,
  listWebhooks,
} from "@/application/webhooks/queries.ts";
import type { WebhookAppContext } from "@/application/webhooks/types.ts";
import { FlagRegistry } from "@/flags/registry.ts";
import { optionalTrpcEntityManager, requireTrpcEntityManager, type TrpcContext } from "../context.ts";
import { permissionedProcedure } from "../middleware.ts";
import {
  DeliveryOutputSchema,
  ListDeliveriesInputSchema,
  WebhookInputSchema,
  WebhookOutputSchema,
  WebhookUpdateInputSchema,
} from "../schemas/webhooks.ts";
import { t } from "../trpc.ts";

async function assertOutboundWebhooksEnabled(ctx: {
  container: import("@needle-di/core").Container | null;
  orgId: string | null;
  userId: string | null;
}): Promise<void> {
  const envFlags = (process.env.FULCRUM_FEATURES ?? "").split(",").map((flag) => flag.trim());
  if (envFlags.includes("outbound-webhooks")) return;

  if (ctx.container?.has(FlagRegistry)) {
    try {
      const flagRegistry = ctx.container.get(FlagRegistry);
      const enabled = await flagRegistry.isEnabled("outbound-webhooks", {
        orgId: ctx.orgId ?? undefined,
        userId: ctx.userId ?? undefined,
      });
      if (enabled) return;
    } catch {
      // Preserve existing fail-closed feature-gate behavior.
    }
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Feature 'outbound-webhooks' is disabled. Enable it via FULCRUM_FEATURES or the flags API.",
  });
}

function appContext(ctx: TrpcContext): WebhookAppContext {
  if (!ctx.orgId) throw new TRPCError({ code: "UNAUTHORIZED", message: "No org context." });
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

async function nullableNotFound<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppNotFoundError) return null;
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

const deliveriesRouter = t.router({
  list: permissionedProcedure({ resource: "webhooks", action: "list" })
    .input(ListDeliveriesInputSchema)
    .output(z.array(DeliveryOutputSchema))
    .query(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      const em = optionalTrpcEntityManager(ctx);
      if (!em) return [];
      return mapAppError(() =>
        listWebhookDeliveries(em, appContext(ctx), input)
      );
    }),

  get: permissionedProcedure({ resource: "webhooks", action: "get" })
    .input(z.object({ id: z.string().uuid() }))
    .output(DeliveryOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      const em = optionalTrpcEntityManager(ctx);
      if (!em) return null;
      return nullableNotFound(() =>
        getWebhookDelivery(em, appContext(ctx), input.id)
      );
    }),
});

export const webhooksRouter = t.router({
  list: permissionedProcedure({ resource: "webhooks", action: "list" })
    .input(z.void())
    .output(z.array(WebhookOutputSchema))
    .query(async ({ ctx }) => {
      await assertOutboundWebhooksEnabled(ctx);
      const em = optionalTrpcEntityManager(ctx);
      if (!em) return [];
      return mapAppError(() =>
        listWebhooks(em, appContext(ctx))
      );
    }),

  get: permissionedProcedure({ resource: "webhooks", action: "get" })
    .input(z.object({ id: z.string().uuid() }))
    .output(WebhookOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      const em = optionalTrpcEntityManager(ctx);
      if (!em) return null;
      return nullableNotFound(() =>
        getWebhook(em, appContext(ctx), input.id)
      );
    }),

  create: permissionedProcedure({ resource: "webhooks", action: "create" })
    .input(WebhookInputSchema)
    .output(WebhookOutputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      return mapAppError(() =>
        createWebhook(requireTrpcEntityManager(ctx, "No database connection."), appContext(ctx), input)
      );
    }),

  update: permissionedProcedure({ resource: "webhooks", action: "update" })
    .input(WebhookUpdateInputSchema)
    .output(WebhookOutputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      return mapAppError(() =>
        updateWebhook(requireTrpcEntityManager(ctx, "No database connection."), appContext(ctx), input)
      );
    }),

  delete: permissionedProcedure({ resource: "webhooks", action: "delete" })
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      await assertOutboundWebhooksEnabled(ctx);
      return mapAppError(() =>
        deleteWebhook(requireTrpcEntityManager(ctx, "No database connection."), appContext(ctx), input.id)
      );
    }),

  deliveries: deliveriesRouter,
});

export type WebhooksRouter = typeof webhooksRouter;
