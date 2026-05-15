import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  type WebhookSecretCryptoOptions,
} from "@integration-hub/application/webhooks/encryption.ts";
import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { Webhook } from "@platform-core/infrastructure/application-database/entities/notifications/Webhook.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { projectWebhook } from "@integration-hub/application/webhooks/queries.ts";
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookAppContext,
  WebhookDto,
} from "@integration-hub/domain/webhook.ts";

export interface WebhookSubscriptionRecord {
  id: string;
  orgId: string;
  url: string;
  events: string[];
  encryptedSecret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookSubscriptionDTO {
  id: string;
  orgId: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  secretRedacted: true;
}

export interface WebhookSubscriptionRepository {
  save(record: WebhookSubscriptionRecord): Promise<WebhookSubscriptionRecord>;
  list(orgId: string): Promise<WebhookSubscriptionRecord[]>;
  findById?(id: string): Promise<WebhookSubscriptionRecord | null>;
}

export interface WebhookCommandDeps extends WebhookSecretCryptoOptions {
  repository: WebhookSubscriptionRepository;
  id?: () => string;
  now?: () => Date;
}

export async function createWebhookSubscription(
  input: {
    orgId: string;
    url: string;
    secret: string;
    events?: string[];
    active?: boolean;
  },
  deps: WebhookCommandDeps,
): Promise<WebhookSubscriptionDTO> {
  const now = deps.now?.() ?? new Date();
  const record = await deps.repository.save({
    id: deps.id?.() ?? crypto.randomUUID(),
    orgId: input.orgId,
    url: input.url,
    events: input.events ?? [],
    encryptedSecret: await encryptWebhookSecret(input.secret, deps),
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  });

  return projectSubscription(record);
}

export async function listWebhookSubscriptions(
  orgId: string,
  deps: WebhookCommandDeps,
): Promise<WebhookSubscriptionDTO[]> {
  const rows = await deps.repository.list(orgId);
  return rows.map(projectSubscription);
}

export async function decryptWebhookSubscriptionSecret(
  record: WebhookSubscriptionRecord,
  deps: WebhookSecretCryptoOptions = {},
): Promise<string> {
  return decryptWebhookSecret(record.encryptedSecret, deps);
}

export async function createWebhook(
  em: EntityManager,
  ctx: WebhookAppContext,
  input: CreateWebhookInput,
  cryptoOptions: WebhookSecretCryptoOptions = {},
): Promise<WebhookDto> {
  validateWebhookInput(input);
  const webhook = em.create(Webhook, {
    org: em.getReference(Org, ctx.orgId),
    name: input.name,
    url: input.url,
    encryptedSecret: input.secret ? await encryptWebhookSecret(input.secret, cryptoOptions) : null,
    eventsFilter: input.eventsFilter ?? null,
    enabled: input.enabled ?? true,
  });
  em.persist(webhook);
  await em.flush();
  return projectWebhook(webhook);
}

export async function updateWebhook(
  em: EntityManager,
  ctx: WebhookAppContext,
  input: UpdateWebhookInput,
  cryptoOptions: WebhookSecretCryptoOptions = {},
): Promise<WebhookDto> {
  const webhook = await em.findOne(Webhook, { id: input.id, org: { id: ctx.orgId } });
  if (!webhook) throw new AppNotFoundError("Webhook not found.");

  validateWebhookInput(input, { partial: true });
  if (input.name !== undefined) webhook.name = input.name;
  if (input.url !== undefined) webhook.url = input.url;
  if (input.secret !== undefined) webhook.encryptedSecret = await encryptWebhookSecret(input.secret, cryptoOptions);
  if (input.eventsFilter !== undefined) webhook.eventsFilter = input.eventsFilter;
  if (input.enabled !== undefined) webhook.enabled = input.enabled;

  await em.flush();
  return projectWebhook(webhook);
}

export async function deleteWebhook(
  em: EntityManager,
  ctx: WebhookAppContext,
  id: string,
): Promise<{ ok: true }> {
  const webhook = await em.findOne(Webhook, { id, org: { id: ctx.orgId } });
  if (!webhook) throw new AppNotFoundError("Webhook not found.");
  em.remove(webhook);
  await em.flush();
  return { ok: true };
}

function projectSubscription(record: WebhookSubscriptionRecord): WebhookSubscriptionDTO {
  return {
    id: record.id,
    orgId: record.orgId,
    url: record.url,
    events: [...record.events],
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    secretRedacted: true,
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
