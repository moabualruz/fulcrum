import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  type WebhookSecretCryptoOptions,
} from "./encryption.ts";

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
