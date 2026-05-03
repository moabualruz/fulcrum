/**
 * Migration: telemetry_outbox table.
 *
 * Stores batches of TelemetryEvent rows queued for remote POST.
 * Written only when `telemetry-remote` feature flag is ON; table exists
 * always (C1: build everything, gate behind flag at write time).
 *
 * C2: no org_id FK — outbox is a process-level queue; org context lives
 *     inside the serialised batchJson.
 * C6: addSql strings are the sanctioned escape hatch inside Migration bodies.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/16-gated-telemetry-remote.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260504120000_telemetry_outbox extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "telemetry_outbox" (
        "id" uuid not null default gen_random_uuid(),
        "batch_json" text not null,
        "attempts" integer not null default 0,
        "last_attempt_at" timestamptz null,
        "status" varchar(16) not null default 'queued',
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        constraint "telemetry_outbox_status_check"
          check ("status" in ('queued','retrying','sent','dead'))
      )`,
    );
    this.addSql(
      `create index "idx_telemetry_outbox_status" on "telemetry_outbox" ("status")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "telemetry_outbox" cascade`);
  }
}
