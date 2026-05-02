/**
 * Flag-stub tables migration — auto-generated from entity decorator diffs.
 *
 * Creates the 3 flag-gated stub tables. Rows are written only when their
 * respective feature flags are enabled by a later pillar:
 *
 *   - casbin_rule           (Pillar 5)   gated by `casbin-policies`
 *   - webhook_subscriptions (Pillar 10)  gated by `outbound-webhooks`
 *   - notification_rules    (Pillar 12)  gated by `notify-email`/
 *                                        `notify-webhook`/`notify-slack`
 *
 * `casbin_rule` follows the node-casbin standard adapter contract (id +
 * ptype + v0..v5) — NOT tenant-scoped here because Pillar 5 encodes org
 * inside `v0` per the casbin namespace convention.
 *
 * `webhook_subscriptions` and `notification_rules` ARE tenant-scoped with
 * composite indexes from day 1.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501130100_flag_stubs extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // ── casbin_rule (Pillar 5: Permissions) ────────────────────────────────
    // node-casbin standard adapter schema.
    this.addSql(
      `create table "casbin_rule" ("id" uuid not null default gen_random_uuid(), "ptype" varchar(255) not null, "v0" varchar(255) null, "v1" varchar(255) null, "v2" varchar(255) null, "v3" varchar(255) null, "v4" varchar(255) null, "v5" varchar(255) null, primary key ("id"))`,
    );

    // ── webhook_subscriptions (Pillar 10: Webhooks) ───────────────────────
    // C10: minimal stub — only index-axis columns (org_id, active).
    // Domain fields (url, events, secret, created_at) added by Pillar 10 migration.
    this.addSql(
      `create table "webhook_subscriptions" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "active" boolean not null default true, primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_webhook_subscriptions_org_active" on "webhook_subscriptions" ("org_id", "active")`,
    );
    this.addSql(
      `alter table "webhook_subscriptions" add constraint "webhook_subscriptions_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── notification_rules (Pillar 12: Notifications) ─────────────────────
    // C10: minimal stub — only index-axis columns (org_id, subject_kind, active).
    // Domain fields (verb, channel, target, created_at) added by Pillar 12 migration.
    this.addSql(
      `create table "notification_rules" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "subject_kind" varchar(255) not null, "active" boolean not null default true, primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_notification_rules_org_active_subject" on "notification_rules" ("org_id", "active", "subject_kind")`,
    );
    this.addSql(
      `alter table "notification_rules" add constraint "notification_rules_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "notification_rules" cascade`);
    this.addSql(`drop table if exists "webhook_subscriptions" cascade`);
    this.addSql(`drop table if exists "casbin_rule" cascade`);
  }
}
