/**
 * Events org_id backfill migration.
 *
 * Creates the `orgs` table and `events` table with `org_id` NOT NULL from day one.
 * On a fresh schema there are no legacy rows to backfill; the `em.nativeUpdate` call
 * is the C6-permitted carve-out for any pre-existing rows that may have org = null.
 *
 * Composite indexes created:
 *   idx_events_org_created  — (org_id, created_at desc) for timeline queries.
 *   idx_events_subject      — (org_id, subject_kind, subject_id, created_at desc)
 *                             for subject-scoped audit queries.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/02-events-org-id-backfill.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501120537_events_org_id_backfill extends Migration {
  override async up(): Promise<void> {
    // ── orgs table ───────────────────────────────────────────────────────────
    this.addSql(
      `create table "orgs" ("id" uuid not null default gen_random_uuid(), "name" varchar(255) not null, "slug" varchar(255) not null, "avatar_url" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "orgs" add constraint "uq_orgs_slug" unique ("slug")`,
    );

    // ── events table ─────────────────────────────────────────────────────────
    // org_id is NOT NULL from day one (C2, Q23). No schema migration needed
    // for SaaS backfill in this branch since the table is brand new.
    this.addSql(
      `create table "events" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "user_id" uuid null, "verb" varchar(255) not null, "subject_kind" varchar(255) not null, "subject_id" varchar(255) null, "payload" jsonb null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );

    // ── backfill (C6 carve-out) ───────────────────────────────────────────────
    // On a fresh schema this is a no-op. If somehow legacy rows exist with
    // org_id = null (e.g., a pre-migration data load), set them to the
    // well-known local org UUID (D4: 00000000-0000-0000-0000-000000000001).
    this.addSql(
      `update "events" set "org_id" = '00000000-0000-0000-0000-000000000001' where "org_id" is null`,
    );

    // ── FK constraints ────────────────────────────────────────────────────────
    this.addSql(
      `alter table "events" add constraint "events_org_id_fkey" foreign key ("org_id") references "orgs" ("id") on update cascade`,
    );
    this.addSql(
      `alter table "events" add constraint "events_user_id_fkey" foreign key ("user_id") references "users" ("id") on update cascade on delete set null`,
    );

    // ── composite indexes (Q22) ───────────────────────────────────────────────
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
