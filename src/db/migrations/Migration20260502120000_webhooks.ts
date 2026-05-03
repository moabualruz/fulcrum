/**
 * Migration: webhooks + webhook_deliveries tables (Pillar 13, Issue 07).
 *
 * Creates:
 *   - webhooks(id, org_id, name, url, encrypted_secret, events_filter jsonb,
 *              enabled, created_at, updated_at, last_delivery_at)
 *   - webhook_deliveries(id, org_id, webhook_id, event_id, status, attempt,
 *                        payload jsonb, response_code, error, next_retry_at, created_at)
 *
 * Constraints:
 *   - UNIQUE(org_id, name) on webhooks
 *   - FK webhooks.org_id → orgs(id) ON DELETE CASCADE
 *   - FK webhook_deliveries.org_id → orgs(id) ON DELETE CASCADE
 *   - FK webhook_deliveries.webhook_id → webhooks(id) ON DELETE CASCADE
 *   - CHECK status IN ('pending','delivered','failed','retrying')
 *
 * Indexes per Q22:
 *   - idx_webhooks_org_enabled (org_id, enabled)
 *   - idx_wd_org_webhook_status (org_id, webhook_id, status)
 *   - idx_wd_next_retry (next_retry_at)
 *
 * C6: No raw SQL strings outside migrations.
 * Idempotent via CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502120000_webhooks extends Migration {
  override async up(): Promise<void> {
    // webhooks table
    this.addSql(
      `create table if not exists "webhooks" (` +
        `"id" uuid not null default gen_random_uuid(), ` +
        `"org_id" uuid not null, ` +
        `"name" text not null, ` +
        `"url" text not null, ` +
        `"encrypted_secret" text null, ` +
        `"events_filter" jsonb null, ` +
        `"enabled" boolean not null default true, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"last_delivery_at" timestamptz null, ` +
        `constraint "webhooks_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade, ` +
        `constraint "uq_webhooks_org_name" unique ("org_id", "name"), ` +
        `primary key ("id")` +
        `)`,
    );

    this.addSql(
      `create index if not exists "idx_webhooks_org_enabled" on "webhooks" ("org_id", "enabled")`,
    );

    // webhook_deliveries table
    this.addSql(
      `create table if not exists "webhook_deliveries" (` +
        `"id" uuid not null default gen_random_uuid(), ` +
        `"org_id" uuid not null, ` +
        `"webhook_id" uuid not null, ` +
        `"event_id" uuid null, ` +
        `"status" text not null default 'pending' check ("status" in ('pending','delivered','failed','retrying')), ` +
        `"attempt" integer not null default 1, ` +
        `"payload" jsonb null, ` +
        `"response_code" integer null, ` +
        `"error" text null, ` +
        `"next_retry_at" timestamptz null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `constraint "webhook_deliveries_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade, ` +
        `constraint "webhook_deliveries_webhook_id_foreign" foreign key ("webhook_id") references "webhooks" ("id") on delete cascade, ` +
        `primary key ("id")` +
        `)`,
    );

    this.addSql(
      `create index if not exists "idx_wd_org_webhook_status" on "webhook_deliveries" ("org_id", "webhook_id", "status")`,
    );

    this.addSql(
      `create index if not exists "idx_wd_next_retry" on "webhook_deliveries" ("next_retry_at")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "idx_wd_next_retry"`);
    this.addSql(`drop index if exists "idx_wd_org_webhook_status"`);
    this.addSql(`drop table if exists "webhook_deliveries" cascade`);

    this.addSql(`drop index if exists "idx_webhooks_org_enabled"`);
    this.addSql(`drop table if exists "webhooks" cascade`);
  }
}
