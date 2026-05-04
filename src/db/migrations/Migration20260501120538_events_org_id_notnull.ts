/**
 * Events org_id NOT NULL migration — backfill + constraint + FK + indexes.
 *
 * This migration is step 2 of a two-migration pattern for the events org_id rollout:
 *   1. Migration20260501120537_events_org_id_backfill — CREATE TABLE orgs + events (org_id nullable).
 *   2. (THIS FILE) Backfill: set org_id to well-known local org UUID for any rows where
 *      org_id IS NULL. Then flip org_id to NOT NULL, add FK constraints, and add composite
 *      indexes with DESC ordering (Q22).
 *
 * The backfill UPDATE is the C6-sanctioned carve-out — data DML inside a migration class body.
 * On a fresh schema (no pre-existing events rows) the UPDATE is a no-op. On a branch with
 * pre-migration data, every event row gets a valid org before the NOT NULL flip.
 *
 * Composite indexes:
 *   idx_events_org_created  — (org_id, created_at DESC) for timeline queries.
 *   idx_events_subject      — (org_id, subject_kind, subject_id, created_at DESC)
 *
 * Splitting from the CREATE TABLE migration enables tests to insert a null-org event row
 * between step 1 and step 2, exercising the live backfill path without weakening
 * production DDL semantics (no IF NOT EXISTS anywhere).
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/02-events-org-id-backfill.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501120538_events_org_id_notnull extends Migration {
  override async up(): Promise<void> {
    // ── 3. backfill (C6 carve-out: data DML inside migration class body) ─────
    // Set org_id to the well-known local org UUID (D4) for any rows with org_id IS NULL.
    // On a fresh schema this is a no-op; on a branch with pre-migration data it ensures
    // every event row has a valid org before we flip the column to NOT NULL.
    this.addSql(
      `update "events" set "org_id" = '00000000-0000-0000-0000-000000000001' where "org_id" is null`,
    );

    // ── 4. flip org_id to NOT NULL ────────────────────────────────────────────
    this.addSql(
      `alter table "events" alter column "org_id" set not null`,
    );

    // ── 5. FK constraints ─────────────────────────────────────────────────────
    this.addSql(
      `alter table "events" add constraint "events_org_id_fkey" foreign key ("org_id") references "orgs" ("id") on update cascade`,
    );
    this.addSql(
      `alter table "events" add constraint "events_user_id_fkey" foreign key ("user_id") references "users" ("id") on update cascade on delete set null`,
    );

    // ── 6. composite indexes (Q22) ────────────────────────────────────────────
    this.addSql(
      `create index "idx_events_org_created" on "events" ("org_id", "created_at" desc)`,
    );
    this.addSql(
      `create index "idx_events_subject" on "events" ("org_id", "subject_kind", "subject_id", "created_at" desc)`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "events" drop constraint if exists "events_org_id_fkey"`,
    );
    this.addSql(
      `alter table "events" drop constraint if exists "events_user_id_fkey"`,
    );
    this.addSql(`drop index if exists "idx_events_subject"`);
    this.addSql(`drop index if exists "idx_events_org_created"`);
    this.addSql(
      `alter table "events" alter column "org_id" drop not null`,
    );
  }
}
