import { randomUUID } from "node:crypto";

import type { DataSource } from "typeorm";

import {
  encryptWebhookSecret,
} from "@integration-hub/application/webhooks/encryption.ts";
import type {
  CreateWebhookInput,
  DeliveryDto,
  UpdateWebhookInput,
  WebhookDto,
  WebhookEventType,
} from "@integration-hub/domain/webhook.ts";
import {
  IntegrationWebhookDeliveryEntity,
  IntegrationWebhookEntity,
  type IntegrationWebhook,
  type IntegrationWebhookDelivery,
} from "@integration-hub/infrastructure/database/webhook.entities.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";

export class WebhookPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async listWebhooks(input: { orgId: string; includeDisabled?: boolean }): Promise<WebhookDto[]> {
    const repository = this.dataSource.getRepository(IntegrationWebhookEntity);
    const rows = await repository.find({
      where: {
        orgId: input.orgId,
        ...(input.includeDisabled ? {} : { enabled: true }),
      },
      order: { createdAt: "DESC" },
    });
    return rows.map(toWebhookDto);
  }

  async getWebhook(input: { orgId: string; id: string }): Promise<WebhookDto | null> {
    const row = await this.dataSource.getRepository(IntegrationWebhookEntity).findOneBy({
      orgId: input.orgId,
      id: input.id,
    });
    return row ? toWebhookDto(row) : null;
  }

  async createWebhook(input: CreateWebhookInput & { orgId: string }): Promise<WebhookDto> {
    validateWebhookInput(input);
    const now = new Date();
    const row = this.dataSource.getRepository(IntegrationWebhookEntity).create({
      id: randomUUID(),
      orgId: input.orgId,
      name: input.name.trim(),
      url: input.url.trim(),
      encryptedSecret: input.secret ? await encryptWebhookSecret(input.secret) : null,
      eventsFilter: input.eventsFilter ?? null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      lastDeliveryAt: null,
    });
    return toWebhookDto(await this.dataSource.getRepository(IntegrationWebhookEntity).save(row));
  }

  async updateWebhook(input: UpdateWebhookInput & { orgId: string }): Promise<WebhookDto | null> {
    validateWebhookInput(input, { partial: true });
    const repository = this.dataSource.getRepository(IntegrationWebhookEntity);
    const row = await repository.findOneBy({ orgId: input.orgId, id: input.id });
    if (!row) return null;
    if (input.name !== undefined) row.name = input.name.trim();
    if (input.url !== undefined) row.url = input.url.trim();
    if (input.secret !== undefined) row.encryptedSecret = await encryptWebhookSecret(input.secret);
    if (input.eventsFilter !== undefined) row.eventsFilter = input.eventsFilter;
    if (input.enabled !== undefined) row.enabled = input.enabled;
    row.updatedAt = new Date();
    return toWebhookDto(await repository.save(row));
  }

  async deleteWebhook(input: { orgId: string; id: string }): Promise<{ ok: true }> {
    const repository = this.dataSource.getRepository(IntegrationWebhookEntity);
    const row = await repository.findOneBy({ orgId: input.orgId, id: input.id });
    if (!row) throw new AppNotFoundError("Webhook not found.");
    await repository.delete({ orgId: input.orgId, id: input.id });
    return { ok: true };
  }

  async listDeliveries(input: { orgId: string; webhookId: string; limit?: number }): Promise<DeliveryDto[]> {
    const rows = await this.dataSource.getRepository(IntegrationWebhookDeliveryEntity).find({
      where: { orgId: input.orgId, webhookId: input.webhookId },
      order: { createdAt: "DESC" },
      take: input.limit ?? 50,
    });
    return rows.map(toDeliveryDto);
  }

  async getDelivery(input: { orgId: string; id: string }): Promise<DeliveryDto | null> {
    const row = await this.dataSource.getRepository(IntegrationWebhookDeliveryEntity).findOneBy({
      orgId: input.orgId,
      id: input.id,
    });
    return row ? toDeliveryDto(row) : null;
  }

  async resendDelivery(input: { orgId: string; id: string; now?: Date }): Promise<DeliveryDto | null> {
    const repository = this.dataSource.getRepository(IntegrationWebhookDeliveryEntity);
    const row = await repository.findOneBy({ orgId: input.orgId, id: input.id });
    if (!row) return null;
    row.status = "retrying";
    row.attempt += 1;
    row.nextRetryAt = input.now ?? new Date();
    return toDeliveryDto(await repository.save(row));
  }

  async testWebhook(input: { orgId: string; id: string; now?: Date }): Promise<DeliveryDto | null> {
    const webhookRepository = this.dataSource.getRepository(IntegrationWebhookEntity);
    const webhook = await webhookRepository.findOneBy({ orgId: input.orgId, id: input.id });
    if (!webhook) return null;
    const now = input.now ?? new Date();
    const delivery = await this.dataSource.getRepository(IntegrationWebhookDeliveryEntity).save({
      id: randomUUID(),
      orgId: input.orgId,
      webhookId: input.id,
      eventId: null,
      status: "pending",
      attempt: 1,
      payload: { type: "ping" },
      responseCode: null,
      error: null,
      nextRetryAt: null,
      createdAt: now,
    });
    webhook.lastDeliveryAt = now;
    await webhookRepository.save(webhook);
    return toDeliveryDto(delivery);
  }
}

function toWebhookDto(row: IntegrationWebhook): WebhookDto {
  return {
    id: row.id,
    orgId: row.orgId,
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

function toDeliveryDto(row: IntegrationWebhookDelivery): DeliveryDto {
  return {
    id: row.id,
    orgId: row.orgId,
    webhookId: row.webhookId,
    eventId: row.eventId,
    status: row.status,
    attempt: row.attempt,
    responseCode: row.responseCode,
    error: row.error,
    nextRetryAt: row.nextRetryAt,
    createdAt: row.createdAt,
  };
}

function validateWebhookInput(
  input: Partial<CreateWebhookInput & UpdateWebhookInput>,
  options: { partial?: boolean } = {},
): void {
  if (!options.partial || input.name !== undefined) {
    if (!input.name?.trim()) throw new AppValidationError("Webhook name is required.");
  }
  if (!options.partial || input.url !== undefined) {
    if (!input.url?.trim()) throw new AppValidationError("Webhook URL is required.");
    try {
      new URL(input.url);
    } catch {
      throw new AppValidationError("Webhook URL must be valid.");
    }
  }
  if (input.secret !== undefined && !input.secret.trim()) {
    throw new AppValidationError("Webhook secret must not be empty.");
  }
}
