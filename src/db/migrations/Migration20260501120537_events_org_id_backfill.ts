/**
 * Events org_id schema migration — creates orgs and events tables.
 *
 * This migration is step 1 of a two-migration pattern for the events org_id rollout:
 *   1. (THIS FILE) Create `orgs` table and `events` table with `org_id` NULLABLE.
 *      No backfill here — the column is nullable so pre-existing rows are not
 *      violated before the next migration runs the backfill.
 *   2. Migration20260501120538_events_org_id_notnull — backfill UPDATE → NOT NULL
 *      flip → FK → composite indexes.
 *
 * Splitting into two migrations enables the test fixture to insert a null-org
 * event row between step 1 and step 2 without needing CREATE TABLE IF NOT EXISTS
 * in either migration. Both migrations fail loud on schema drift — no silent no-ops.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/02-events-org-id-backfill.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501120537_events_org_id_backfill extends Migration {
  override async up(): Promise<void> {
    // ── 1. orgs table ────────────────────────────────────────────────────────
    // Strict CREATE TABLE — fails loud if orgs already exists (schema drift).
    this.addSql(
      `create table "orgs" ("id" uuid not null default gen_random_uuid(), "name" varchar(255) not null, "slug" varchar(255) not null, "avatar_url" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "orgs" add constraint "uq_orgs_slug" unique ("slug")`,
    );

    // ── 2. events table — org_id initially NULLABLE ───────────────────────────
    // Column starts nullable so any pre-existing data rows in a later migration
    // don't violate NOT NULL before the backfill step runs.
    // Strict CREATE TABLE — fails loud if events already exists (schema drift).
    this.addSql(
      `create table "events" ("id" uuid not null default gen_random_uuid(), "org_id" uuid null, "user_id" uuid null, "verb" varchar(255) not null, "subject_kind" varchar(255) not null, "subject_id" varchar(255) null, "payload" jsonb null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "events" cascade`);
    this.addSql(`drop table if exists "orgs" cascade`);
  }
}
