/**
 * Migration: Pillar 17 cross-cutting platform tables.
 *
 * Creates the 5 always-on cross-cutting entities owned by Pillar 17:
 *   - credentials             — encrypted secret store (Q-cross-cut, B9)
 *   - telemetry_events        — opt-in usage telemetry (Q-cross-cut, B5)
 *   - error_logs              — crashlog mirror (Q-cross-cut, B6)
 *   - experiment_assignment   — A/B variant assignment (Q-cross-cut, B10)
 *   - feature_flag_rollouts   — rollout policy outside Pillar 1 FeatureFlag (B10)
 *
 * Composite (org_id, …) indexes mandatory at table-creation time per Q22.
 * `*_at DESC` ordering preserved on time-keyed indexes (Q22 + Event entity
 * pattern). Every FK to orgs cascades on delete; FKs to users cascade where
 * the row is meaningless without the user (credentials, experiment_assignment),
 * SET NULL where the row aggregates after the user is gone (telemetry_events,
 * error_logs, feature_flag_rollouts.updated_by).
 *
 * C2: org_id NOT NULL on every entity per locked Q22 decision.
 * C6: addSql(...) strings are the sanctioned escape hatch inside Migration class bodies.
 * C9: Migration class file at services/platform-core/src/infrastructure/application-database/migrations/Migration<timestamp>.ts.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502011859_cross_cutting_platform extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // ── credentials ─────────────────────────────────────────────────────────
    this.addSql(
      `create table "credentials" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "user_id" uuid not null,
        "name" varchar(255) not null,
        "encrypted_value" bytea not null,
        "algo" varchar(255) not null default 'nacl-secretbox',
        "kdf" varchar(255) not null default 'argon2id',
        "provider" varchar(255) not null default 'local',
        "created_at" timestamptz not null default now(),
        "last_used_at" timestamptz null,
        "archived" boolean not null default false,
        primary key ("id")
      )`,
    );
    this.addSql(
      `create unique index "uq_credentials_org_user_name" on "credentials" ("org_id", "user_id", "name")`,
    );
    this.addSql(
      `create index "idx_credentials_org_user_last_used" on "credentials" ("org_id", "user_id", "last_used_at" desc)`,
    );
    this.addSql(
      `create index "idx_credentials_org_archived" on "credentials" ("org_id", "archived")`,
    );
    this.addSql(
      `alter table "credentials" add constraint "credentials_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "credentials" add constraint "credentials_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade`,
    );

    // ── telemetry_events ────────────────────────────────────────────────────
    this.addSql(
      `create table "telemetry_events" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "user_id" uuid null,
        "kind" varchar(255) not null,
        "payload" jsonb not null default '{}'::jsonb,
        "occurred_at" timestamptz not null default now(),
        primary key ("id")
      )`,
    );
    this.addSql(
      `create index "idx_telemetry_events_org_occurred" on "telemetry_events" ("org_id", "occurred_at" desc)`,
    );
    this.addSql(
      `create index "idx_telemetry_events_org_user_kind" on "telemetry_events" ("org_id", "user_id", "kind")`,
    );
    this.addSql(
      `alter table "telemetry_events" add constraint "telemetry_events_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "telemetry_events" add constraint "telemetry_events_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null`,
    );

    // ── error_logs ──────────────────────────────────────────────────────────
    this.addSql(
      `create table "error_logs" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "user_id" uuid null,
        "occurred_at" timestamptz not null default now(),
        "os" varchar(255) null,
        "arch" varchar(255) null,
        "bun_version" varchar(255) null,
        "fulcrum_version" varchar(255) null,
        "recent_cli_command" text null,
        "recent_trpc_procedure" varchar(255) null,
        "error_message" text not null,
        "stack_trace" text null,
        "context" jsonb not null default '{}'::jsonb,
        primary key ("id")
      )`,
    );
    this.addSql(
      `create index "idx_error_logs_org_occurred" on "error_logs" ("org_id", "occurred_at" desc)`,
    );
    this.addSql(
      `alter table "error_logs" add constraint "error_logs_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "error_logs" add constraint "error_logs_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null`,
    );

    // ── experiment_assignment ───────────────────────────────────────────────
    this.addSql(
      `create table "experiment_assignment" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "user_id" uuid not null,
        "experiment_id" varchar(255) not null,
        "variant" varchar(255) not null,
        "assigned_at" timestamptz not null default now(),
        primary key ("id")
      )`,
    );
    this.addSql(
      `create unique index "uq_experiment_assignment_org_user_experiment" on "experiment_assignment" ("org_id", "user_id", "experiment_id")`,
    );
    this.addSql(
      `create index "idx_experiment_assignment_org_experiment" on "experiment_assignment" ("org_id", "experiment_id")`,
    );
    this.addSql(
      `alter table "experiment_assignment" add constraint "experiment_assignment_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "experiment_assignment" add constraint "experiment_assignment_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade`,
    );

    // ── feature_flag_rollouts ───────────────────────────────────────────────
    this.addSql(
      `create table "feature_flag_rollouts" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "flag_id" uuid not null,
        "rollout_percent" int not null default 100,
        "cohort_rules" jsonb not null default '{}'::jsonb,
        "updated_by" uuid null,
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )`,
    );
    this.addSql(
      `create unique index "uq_feature_flag_rollouts_org_flag" on "feature_flag_rollouts" ("org_id", "flag_id")`,
    );
    this.addSql(
      `alter table "feature_flag_rollouts" add constraint "feature_flag_rollouts_rollout_percent_check" check ("rollout_percent" >= 0 and "rollout_percent" <= 100)`,
    );
    this.addSql(
      `alter table "feature_flag_rollouts" add constraint "feature_flag_rollouts_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "feature_flag_rollouts" add constraint "feature_flag_rollouts_flag_id_foreign" foreign key ("flag_id") references "feature_flags" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "feature_flag_rollouts" add constraint "feature_flag_rollouts_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete set null`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "feature_flag_rollouts" cascade`);
    this.addSql(`drop table if exists "experiment_assignment" cascade`);
    this.addSql(`drop table if exists "error_logs" cascade`);
    this.addSql(`drop table if exists "telemetry_events" cascade`);
    this.addSql(`drop table if exists "credentials" cascade`);
  }
}
