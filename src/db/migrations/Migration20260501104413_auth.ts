/**
 * Initial auth migration — auto-generated from entity decorator diffs.
 *
 * Creates the five auth-domain tables:
 *   - users
 *   - sessions
 *   - invitations
 *   - org_members
 *   - feature_flags
 *
 * All tables include:
 *   - org_id FK (C2: SaaS-ready tenancy from day 1)
 *   - Composite (org_id, ...) indexes (C2: per Q22)
 *   - Unique constraints matching entity decorators
 *
 * Note: FKs to `orgs` table reference a table created by a later pillar migration.
 * On initial install the `orgs` table is created by the seed script before this migration.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/01-schema-auth-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501104413_auth extends Migration {
  override async up(): Promise<void> {
    // feature_flags
    this.addSql(
      `create table "feature_flags" ("id" uuid not null default gen_random_uuid(), "org_id" uuid null, "user_id" uuid null, "flag" varchar(255) not null, "enabled" boolean not null default false, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_feature_flags_org_flag" on "feature_flags" ("org_id", "flag")`,
    );
    this.addSql(
      `alter table "feature_flags" add constraint "uq_feature_flags_org_user_flag" unique ("org_id", "user_id", "flag")`,
    );
    this.addSql(
      `create unique index "uq_feature_flags_global_flag" on "feature_flags" ("flag") where "org_id" is null and "user_id" is null`,
    );

    // invitations
    this.addSql(
      `create table "invitations" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "email" varchar(255) not null, "role" varchar(255) not null default 'member', "token" varchar(255) not null, "invited_by" uuid null, "accepted_at" timestamptz null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_invitations_org_email" on "invitations" ("org_id", "email")`,
    );
    this.addSql(
      `alter table "invitations" add constraint "uq_invitations_token" unique ("token")`,
    );

    // org_members
    this.addSql(
      `create table "org_members" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "user_id" uuid not null, "role" varchar(255) not null default 'member', "joined_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_org_members_org_user" on "org_members" ("org_id", "user_id")`,
    );
    this.addSql(
      `create index "idx_org_members_user" on "org_members" ("user_id")`,
    );
    this.addSql(
      `alter table "org_members" add constraint "uq_org_members_org_user" unique ("org_id", "user_id")`,
    );

    // sessions
    this.addSql(
      `create table "sessions" ("id" varchar(255) not null, "user_id" uuid not null, "org_id" uuid not null, "active_organization_id" uuid null, "expires_at" timestamptz not null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_sessions_user_expires" on "sessions" ("user_id", "expires_at")`,
    );
    this.addSql(`create index "idx_sessions_org" on "sessions" ("org_id")`);

    // users
    this.addSql(
      `create table "users" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "email" varchar(255) not null, "name" varchar(255) null, "avatar_url" varchar(255) null, "role" text not null default 'member', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_users_org_email" on "users" ("org_id", "email")`,
    );
    this.addSql(
      `alter table "users" add constraint "uq_users_org_email" unique ("org_id", "email")`,
    );
    this.addSql(
      `alter table "users" add constraint "users_role_check" check ("role" in ('owner', 'admin', 'member', 'guest'))`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "users" cascade`);
    this.addSql(`drop table if exists "sessions" cascade`);
    this.addSql(`drop table if exists "org_members" cascade`);
    this.addSql(`drop table if exists "invitations" cascade`);
    this.addSql(`drop table if exists "feature_flags" cascade`);
  }
}
