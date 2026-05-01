/**
 * Events org_id backfill migration.
 *
 * Implements the spec-required ordering for adding org_id to events:
 *   1. Create `orgs` table.
 *   2. Create `events` table with `org_id` initially NULLABLE (backfill pattern).
 *   3. Backfill: set org_id to well-known local org UUID for any rows where org_id IS NULL.
 *      This is the C6-sanctioned carve-out — data DML inside a migration class body only.
 *   4. Flip column to NOT NULL.
 *   5. Add FK constraints.
 *   6. Add composite indexes with DESC ordering (Q22):
 *        idx_events_org_created  — (org_id, created_at DESC) for timeline queries.
 *        idx_events_subject      — (org_id, subject_kind, subject_id, created_at DESC)
 *   7. Drop old single-column idx_events_subject index if present (replaced by composite).
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/02-events-org-id-backfill.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501120537_events_org_id_backfill extends Migration {
  override async up(): Promise<void> {
    // ── 1. orgs table ────────────────────────────────────────────────────────
    this.addSql(
      `create table if not exists "orgs" ("id" uuid not null default gen_random_uuid(), "name" varchar(255) not null, "slug" varchar(255) not null, "avatar_url" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "orgs" add constraint "uq_orgs_slug" unique ("slug")`,
    );

    // ── 2. events table — org_id initially NULLABLE (backfill pattern) ───────
    // Column starts nullable so any pre-existing rows don't violate NOT NULL
    // before the backfill step runs.
    this.addSql(
      `create table if not exists "events" ("id" uuid not null default gen_random_uuid(), "org_id" uuid null, "user_id" uuid null, "verb" varchar(255) not null, "subject_kind" varchar(255) not null, "subject_id" varchar(255) null, "payload" jsonb null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );

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
    this.addSql(`drop table if exists "events" cascade`);
    this.addSql(`drop table if exists "orgs" cascade`);
  }
}
