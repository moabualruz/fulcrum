/**
 * Migration: Pillar 12 notifications + activity + audit schema.
 *
 * Expands the stub `notification_rules` table (P1#03 flag stubs) with
 * per-user declarative rule fields, then creates 7 new notification tables.
 *
 * Tables created / altered:
 *   notification_rules      — ALTER: add user_id, name, event_pattern,
 *                             channels, enabled, created_at, updated_at
 *                             + composite indexes
 *   user_notifications      — per-user in-app notification rows
 *   notification_deliveries — per-channel dispatch attempt log
 *   notification_mutes      — per-user entity-level mute records
 *   notification_quiet_hours— per-user quiet window config
 *   event_retention_policy  — per-org/project event pruning config
 *   webhook_rule_configs    — outbound webhook URL + encrypted HMAC secret
 *   push_subscriptions      — VAPID Web Push subscription records
 *
 * Idempotency: all DDL guarded with IF NOT EXISTS / DO $$ conditional blocks.
 * A4 seed: EventRetentionPolicy for local org (retain_days=365) created if absent.
 *
 * Closes: .scratch/agent-os-vision/12-notifications-activity-audit/issues/01-schema-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

/** Well-known local org UUID (D4). */
const LOCAL_ORG_ID = "00000000-0000-0000-0000-000000000001";

export class Migration20260502110300_notifications extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // ── Expand notification_rules ──────────────────────────────────────────────

    // P1 stub created subject_kind NOT NULL; new schema replaces it with event_pattern jsonb.
    // Drop NOT NULL constraint so default-rules seeding can insert without subject_kind.
    this.addSql(`alter table "notification_rules" alter column "subject_kind" drop not null`);

    // Add per-user + declarative-rule columns (idempotent ADD COLUMN IF NOT EXISTS).
    this.addSql(`alter table "notification_rules" add column if not exists "user_id" uuid null`);
    this.addSql(`alter table "notification_rules" add column if not exists "name" varchar(255) null`);
    this.addSql(`alter table "notification_rules" add column if not exists "event_pattern" jsonb null`);
    this.addSql(`alter table "notification_rules" add column if not exists "channels" text[] null`);
    this.addSql(`alter table "notification_rules" add column if not exists "enabled" boolean not null default true`);
    this.addSql(`alter table "notification_rules" add column if not exists "created_at" timestamptz null`);
    this.addSql(`alter table "notification_rules" add column if not exists "updated_at" timestamptz null`);

    // Composite indexes on notification_rules (idempotent).
    this.addSql(
      `create index if not exists "notification_rules_org_user" on "notification_rules" ("org_id", "user_id")`,
    );
    this.addSql(
      `create index if not exists "notification_rules_org_enabled" on "notification_rules" ("org_id", "enabled")`,
    );
    this.addSql(
      `create unique index if not exists "uq_notification_rules_user_name" on "notification_rules" ("user_id", "name")`,
    );

    // ── user_notifications ─────────────────────────────────────────────────────

    this.addSql(`
      create table if not exists "user_notifications" (
        "id"          uuid          not null default gen_random_uuid(),
        "org_id"      uuid          not null,
        "user_id"     uuid          not null,
        "rule_id"     uuid          null,
        "event_id"    uuid          not null,
        "title"       varchar(255)  not null,
        "body"        text          not null default '',
        "entity_kind" varchar(255)  not null,
        "entity_id"   uuid          not null,
        "read_at"     timestamptz   null,
        "created_at"  timestamptz   not null default now(),
        primary key ("id")
      )
    `);

    // UNIQUE (user_id, event_id, rule_id) — NULLS NOT DISTINCT so null rule_id counts.
    this.addSql(`
      create unique index if not exists "uq_user_notifications_user_event_rule"
        on "user_notifications" ("user_id", "event_id", "rule_id") nulls not distinct
    `);

    this.addSql(`
      create index if not exists "idx_user_notifications_org_user_read"
        on "user_notifications" ("org_id", "user_id", "read_at")
    `);
    this.addSql(`
      create index if not exists "idx_user_notifications_org_user_created"
        on "user_notifications" ("org_id", "user_id", "created_at")
    `);

    // FK: org cascade delete.
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'user_notifications_org_id_foreign'
        ) then
          alter table "user_notifications"
            add constraint "user_notifications_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);

    // FK: rule cascade set null on delete.
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'user_notifications_rule_id_foreign'
        ) then
          alter table "user_notifications"
            add constraint "user_notifications_rule_id_foreign"
            foreign key ("rule_id") references "notification_rules" ("id") on delete set null;
        end if;
      end $$
    `);

    // FK: event cascade delete (events table owned by Pillar 1; conditional).
    this.addSql(`
      do $$ begin
        if to_regclass('public.events') is not null
          and not exists (
            select 1 from pg_constraint where conname = 'user_notifications_event_id_foreign'
          )
        then
          alter table "user_notifications"
            add constraint "user_notifications_event_id_foreign"
            foreign key ("event_id") references "events" ("id") on delete cascade;
        end if;
      end $$
    `);

    // ── notification_deliveries ────────────────────────────────────────────────

    this.addSql(`
      create table if not exists "notification_deliveries" (
        "id"              uuid          not null default gen_random_uuid(),
        "org_id"          uuid          not null,
        "rule_id"         uuid          not null,
        "notification_id" uuid          null,
        "user_id"         uuid          not null,
        "channel"         varchar(255)  not null,
        "status"          varchar(255)  not null default 'pending',
        "attempt_count"   integer       not null default 0,
        "last_error"      text          null,
        "payload"         jsonb         not null default '{}'::jsonb,
        "sent_at"         timestamptz   null,
        "retry_after"     timestamptz   null,
        "created_at"      timestamptz   not null default now(),
        constraint "notification_deliveries_status_check"
          check ("status" in ('pending','sent','failed','retrying','suppressed')),
        primary key ("id")
      )
    `);

    this.addSql(`
      create index if not exists "idx_nd_org_user_channel_status"
        on "notification_deliveries" ("org_id", "user_id", "channel", "status")
    `);
    this.addSql(`
      create index if not exists "idx_nd_retry_after"
        on "notification_deliveries" ("retry_after")
    `);

    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'notification_deliveries_org_id_foreign'
        ) then
          alter table "notification_deliveries"
            add constraint "notification_deliveries_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'notification_deliveries_rule_id_foreign'
        ) then
          alter table "notification_deliveries"
            add constraint "notification_deliveries_rule_id_foreign"
            foreign key ("rule_id") references "notification_rules" ("id") on delete cascade;
        end if;
      end $$
    `);

    // ── notification_mutes ─────────────────────────────────────────────────────

    this.addSql(`
      create table if not exists "notification_mutes" (
        "id"           uuid          not null default gen_random_uuid(),
        "org_id"       uuid          not null,
        "user_id"      uuid          not null,
        "subject_kind" varchar(255)  not null,
        "subject_id"   uuid          not null,
        "muted_until"  timestamptz   null,
        primary key ("id")
      )
    `);

    this.addSql(`
      create unique index if not exists "uq_notification_mutes_user_subject"
        on "notification_mutes" ("user_id", "subject_kind", "subject_id")
    `);
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'notification_mutes_org_id_foreign'
        ) then
          alter table "notification_mutes"
            add constraint "notification_mutes_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);

    // ── notification_quiet_hours ───────────────────────────────────────────────

    this.addSql(`
      create table if not exists "notification_quiet_hours" (
        "id"           uuid          not null default gen_random_uuid(),
        "org_id"       uuid          not null,
        "user_id"      uuid          not null,
        "tz"           varchar(255)  not null default 'UTC',
        "start_hour"   integer       not null,
        "end_hour"     integer       not null,
        "days_of_week" integer[]     not null default '{0,1,2,3,4,5,6}',
        primary key ("id")
      )
    `);

    this.addSql(`
      create unique index if not exists "uq_notification_quiet_hours_user"
        on "notification_quiet_hours" ("user_id")
    `);
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'notification_quiet_hours_org_id_foreign'
        ) then
          alter table "notification_quiet_hours"
            add constraint "notification_quiet_hours_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);

    // ── event_retention_policy ─────────────────────────────────────────────────

    this.addSql(`
      create table if not exists "event_retention_policy" (
        "id"          uuid     not null default gen_random_uuid(),
        "org_id"      uuid     not null,
        "project_id"  uuid     null,
        "retain_days" integer  not null default 0,
        primary key ("id")
      )
    `);

    // NULLS NOT DISTINCT: (org, NULL project) is unique per org.
    this.addSql(`
      create unique index if not exists "uq_event_retention_policy_org_project"
        on "event_retention_policy" ("org_id", "project_id") nulls not distinct
    `);
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'event_retention_policy_org_id_foreign'
        ) then
          alter table "event_retention_policy"
            add constraint "event_retention_policy_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);

    // A4 seed: local org default retention = 365 days.
    // Conditional: only insert if the local org row exists (may not exist in
    // fresh non-seeded migration runs; idempotent via ON CONFLICT).
    this.addSql(`
      insert into "event_retention_policy" ("org_id", "project_id", "retain_days")
      select '${LOCAL_ORG_ID}', null, 365
      where exists (select 1 from "orgs" where "id" = '${LOCAL_ORG_ID}')
      on conflict ("org_id", "project_id") do nothing
    `);

    // ── webhook_rule_configs ───────────────────────────────────────────────────

    this.addSql(`
      create table if not exists "webhook_rule_configs" (
        "id"               uuid   not null default gen_random_uuid(),
        "org_id"           uuid   not null,
        "rule_id"          uuid   not null,
        "url"              text   not null,
        "encrypted_secret" text   not null,
        primary key ("id")
      )
    `);

    this.addSql(`
      create unique index if not exists "uq_webhook_rule_configs_rule"
        on "webhook_rule_configs" ("rule_id")
    `);
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'webhook_rule_configs_org_id_foreign'
        ) then
          alter table "webhook_rule_configs"
            add constraint "webhook_rule_configs_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'webhook_rule_configs_rule_id_foreign'
        ) then
          alter table "webhook_rule_configs"
            add constraint "webhook_rule_configs_rule_id_foreign"
            foreign key ("rule_id") references "notification_rules" ("id") on delete cascade;
        end if;
      end $$
    `);

    // ── push_subscriptions ─────────────────────────────────────────────────────

    this.addSql(`
      create table if not exists "push_subscriptions" (
        "id"         uuid   not null default gen_random_uuid(),
        "org_id"     uuid   not null,
        "user_id"    uuid   not null,
        "endpoint"   text   not null,
        "p256dh"     text   not null,
        "auth"       text   not null,
        "user_agent" text   null,
        primary key ("id")
      )
    `);

    this.addSql(`
      create unique index if not exists "uq_push_subscriptions_user_endpoint"
        on "push_subscriptions" ("user_id", "endpoint")
    `);
    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'push_subscriptions_org_id_foreign'
        ) then
          alter table "push_subscriptions"
            add constraint "push_subscriptions_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "push_subscriptions" cascade`);
    this.addSql(`drop table if exists "webhook_rule_configs" cascade`);
    this.addSql(`drop table if exists "event_retention_policy" cascade`);
    this.addSql(`drop table if exists "notification_quiet_hours" cascade`);
    this.addSql(`drop table if exists "notification_mutes" cascade`);
    this.addSql(`drop table if exists "notification_deliveries" cascade`);
    this.addSql(`drop table if exists "user_notifications" cascade`);
    // Revert expanded columns on notification_rules (best-effort; stub remains).
    this.addSql(`alter table "notification_rules" drop column if exists "user_id"`);
    this.addSql(`alter table "notification_rules" drop column if exists "name"`);
    this.addSql(`alter table "notification_rules" drop column if exists "event_pattern"`);
    this.addSql(`alter table "notification_rules" drop column if exists "channels"`);
    this.addSql(`alter table "notification_rules" drop column if exists "enabled"`);
    this.addSql(`alter table "notification_rules" drop column if exists "created_at"`);
    this.addSql(`alter table "notification_rules" drop column if exists "updated_at"`);
    this.addSql(`drop index if exists "notification_rules_org_user"`);
    this.addSql(`drop index if exists "notification_rules_org_enabled"`);
  }
}
