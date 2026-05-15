import type { EntityManager } from "typeorm";

import { Webhook } from "@notification-center/infrastructure/database/entities/notifications/Webhook.ts";
import { WebhookDelivery } from "@notification-center/infrastructure/database/entities/notifications/WebhookDelivery.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import type {
  DeliveryDto,
  ListWebhookDeliveriesInput,
  WebhookAppContext,
  WebhookDto,
  WebhookEventType,
  WebhookDeliveryStatus,
} from "@integration-hub/domain/webhook.ts";

export async function listWebhooks(em: EntityManager, ctx: WebhookAppContext): Promise<WebhookDto[]> {
  const rows = await em.find(Webhook, { where: { org: { id: ctx.orgId } }, order: { createdAt: "DESC" } });
  return rows.map(projectWebhook);
}

export async function getWebhook(em: EntityManager, ctx: WebhookAppContext, id: string): Promise<WebhookDto> {
  const row = await em.findOne(Webhook, { where: { id, org: { id: ctx.orgId } } as never });
  if (!row) throw new AppNotFoundError("Webhook not found.");
  return projectWebhook(row);
}

export async function listWebhookDeliveries(
  em: EntityManager,
  ctx: WebhookAppContext,
  input: ListWebhookDeliveriesInput,
): Promise<DeliveryDto[]> {
  const rows = await em.find(WebhookDelivery, {
    where: { webhook: { id: input.webhookId }, org: { id: ctx.orgId } } as never,
    take: input.limit ?? 50,
    order: { createdAt: "DESC" },
  });
  return rows.map(projectDelivery);
}

export async function getWebhookDelivery(
  em: EntityManager,
  ctx: WebhookAppContext,
  id: string,
): Promise<DeliveryDto> {
  const row = await em.findOne(WebhookDelivery, { where: { id, org: { id: ctx.orgId } } as never });
  if (!row) throw new AppNotFoundError("Webhook delivery not found.");
  return projectDelivery(row);
}

export function projectWebhook(row: Webhook): WebhookDto {
  return {
    id: row.id,
    orgId: row.org.id,
    name: row.name,
    url: row.url,
    secret: "****",
    eventsFilter: row.eventsFilter as WebhookEventType[] | null,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastDeliveryAt: row.lastDeliveryAt,
  };
}

export function projectDelivery(row: WebhookDelivery): DeliveryDto {
  return {
    id: row.id,
    orgId: row.org.id,
    webhookId: row.webhook.id,
    eventId: row.eventId,
    status: row.status as WebhookDeliveryStatus,
    attempt: row.attempt,
    responseCode: row.responseCode,
    error: row.error,
    nextRetryAt: row.nextRetryAt,
    createdAt: row.createdAt,
  };
}
