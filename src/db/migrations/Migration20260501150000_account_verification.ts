/**
 * Migration: add `accounts` + `verifications` tables.
 *
 * These tables back Better-Auth's "account" (OAuth provider links) and
 * "verification" (email OTP / magic-link tokens) models.
 * Always created even when saas-auth flag is OFF — C1 requires wiring
 * before enabling.
 *
 * C6: addSql(...) strings are the sanctioned escape hatch inside Migration class bodies.
 * C9: Migration class file at src/db/migrations/Migration<timestamp>.ts.
 *
 * Closes (part of issue): .scratch/agent-os-vision/01-foundation-reset/issues/05-better-auth-integration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501150000_account_verification extends Migration {
  override async up(): Promise<void> {
    // accounts — OAuth provider credential links (Better-Auth "account" model)
    this.addSql(
      `create table "accounts" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "provider_id" text not null,
        "account_id" text not null,
        "access_token" text null,
        "refresh_token" text null,
        "access_token_expires_at" timestamptz null,
        "refresh_token_expires_at" timestamptz null,
        "scope" text null,
        "id_token" text null,
        "password" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )`,
    );
    this.addSql(
      `create index "idx_accounts_user_id" on "accounts" ("user_id")`,
    );
    this.addSql(
      `create index "idx_accounts_provider" on "accounts" ("provider_id", "account_id")`,
    );

    // verifications — short-lived tokens for email OTP / magic-link flows
    this.addSql(
      `create table "verifications" (
        "id" uuid not null default gen_random_uuid(),
        "identifier" text not null,
        "value" text not null,
        "expires_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )`,
    );
    this.addSql(
      `create unique index "uq_verifications_identifier_value" on "verifications" ("identifier", "value")`,
    );
    this.addSql(
      `create index "idx_verifications_identifier" on "verifications" ("identifier")`,
    );
    this.addSql(
      `create index "idx_verifications_expires_at" on "verifications" ("expires_at")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "verifications" cascade`);
    this.addSql(`drop table if exists "accounts" cascade`);
  }
}
