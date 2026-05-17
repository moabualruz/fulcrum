import { EntitySchema } from "typeorm";

export type IntegrationWebhookDeliveryStatus = "pending" | "delivered" | "failed" | "retrying";

export interface IntegrationWebhook {
  id: string;
  orgId: string;
  name: string;
  url: string;
  encryptedSecret: string | null;
  eventsFilter: string[] | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt: Date | null;
}

export interface IntegrationWebhookDelivery {
  id: string;
  orgId: string;
  webhookId: string;
  eventId: string | null;
  status: IntegrationWebhookDeliveryStatus;
  attempt: number;
  payload: Record<string, unknown> | null;
  responseCode: number | null;
  error: string | null;
  nextRetryAt: Date | null;
  createdAt: Date;
}

export const IntegrationWebhookEntity = new EntitySchema<IntegrationWebhook>({
  name: "IntegrationWebhook",
  tableName: "webhooks",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    name: { type: "varchar", length: 255 },
    url: { type: "text" },
    encryptedSecret: { name: "encrypted_secret", type: "text", nullable: true },
    eventsFilter: { name: "events_filter", type: "jsonb", nullable: true },
    enabled: { type: "boolean", default: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
    lastDeliveryAt: { name: "last_delivery_at", type: "timestamptz", nullable: true },
  },
  uniques: [
    { name: "uq_webhooks_org_name", columns: ["orgId", "name"] },
  ],
  indices: [
    { name: "idx_webhooks_org_enabled", columns: ["orgId", "enabled"] },
    { name: "idx_webhooks_org_created", columns: ["orgId", "createdAt"] },
  ],
});

export const IntegrationWebhookDeliveryEntity = new EntitySchema<IntegrationWebhookDelivery>({
  name: "IntegrationWebhookDelivery",
  tableName: "webhook_deliveries",
  columns: {
    id: { type: "uuid", primary: true },
    orgId: { name: "org_id", type: "uuid" },
    webhookId: { name: "webhook_id", type: "uuid" },
    eventId: { name: "event_id", type: "uuid", nullable: true },
    status: { type: "varchar", length: 32, default: "'pending'" },
    attempt: { type: "integer", default: 1 },
    payload: { type: "jsonb", nullable: true },
    responseCode: { name: "response_code", type: "integer", nullable: true },
    error: { type: "text", nullable: true },
    nextRetryAt: { name: "next_retry_at", type: "timestamptz", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  indices: [
    { name: "idx_webhook_deliveries_org_webhook_status", columns: ["orgId", "webhookId", "status"] },
    { name: "idx_webhook_deliveries_next_retry", columns: ["nextRetryAt"] },
  ],
});

export const INTEGRATION_HUB_WEBHOOK_ENTITIES = [
  IntegrationWebhookEntity,
  IntegrationWebhookDeliveryEntity,
];
