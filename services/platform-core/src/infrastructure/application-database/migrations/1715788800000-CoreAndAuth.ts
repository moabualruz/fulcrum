import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * CoreAndAuth — creates foundational auth tables:
 *   orgs, users, org_members, sessions, accounts, verifications,
 *   invitations, feature_flags
 */
export class CoreAndAuth1715788800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // orgs
    await queryRunner.query(`
      CREATE TABLE "orgs" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"       varchar NOT NULL,
        "slug"       varchar NOT NULL,
        "avatar_url" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_orgs_slug" UNIQUE ("slug")
      )
    `);

    // users
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('owner', 'admin', 'member', 'guest')
    `);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     varchar NOT NULL,
        "email"      varchar NOT NULL,
        "name"       varchar,
        "avatar_url" varchar,
        "email_verified" boolean NOT NULL DEFAULT false,
        "email_verified_at" timestamptz,
        "role"       "users_role_enum" NOT NULL DEFAULT 'member',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_users_org_email" UNIQUE ("org_id", "email")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_users_org_email" ON "users" ("org_id", "email")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "users_id_org_unique" ON "users" ("id", "org_id")`);

    // org_members
    await queryRunner.query(`
      CREATE TABLE "org_members" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     varchar NOT NULL,
        "user_id"    varchar NOT NULL,
        "role"       varchar NOT NULL DEFAULT 'member',
        "joined_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_org_members_org_user" UNIQUE ("org_id", "user_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_org_members_org_user" ON "org_members" ("org_id", "user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_org_members_user" ON "org_members" ("user_id")`);

    // sessions
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id"                     varchar PRIMARY KEY,
        "user_id"                varchar NOT NULL,
        "org_id"                 varchar NOT NULL,
        "active_organization_id" varchar,
        "expires_at"             timestamptz NOT NULL,
        "ip_address"             varchar,
        "user_agent"             varchar,
        "created_at"             timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_sessions_user_expires" ON "sessions" ("user_id", "expires_at")`);
    await queryRunner.query(`CREATE INDEX "idx_sessions_org" ON "sessions" ("org_id")`);

    // accounts
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"                  uuid REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"                 varchar NOT NULL,
        "provider_id"             varchar NOT NULL,
        "account_id"              varchar NOT NULL,
        "access_token"            text,
        "refresh_token"           text,
        "access_token_expires_at" timestamptz,
        "refresh_token_expires_at" timestamptz,
        "scope"                   varchar,
        "id_token"                text,
        "password"                text,
        "created_at"              timestamptz NOT NULL DEFAULT now(),
        "updated_at"              timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_accounts_provider_account" UNIQUE ("provider_id", "account_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_accounts_org_user" ON "accounts" ("org_id", "user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_accounts_user_id" ON "accounts" ("user_id")`);

    // verifications
    await queryRunner.query(`
      CREATE TABLE "verifications" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "identifier" varchar NOT NULL,
        "value"      varchar NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_verifications_identifier_value" UNIQUE ("identifier", "value")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_verifications_org_identifier" ON "verifications" ("org_id", "identifier")`);
    await queryRunner.query(`CREATE INDEX "idx_verifications_identifier" ON "verifications" ("identifier")`);
    await queryRunner.query(`CREATE INDEX "idx_verifications_expires_at" ON "verifications" ("expires_at")`);

    // invitations
    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      varchar NOT NULL,
        "email"       varchar NOT NULL,
        "role"        varchar NOT NULL DEFAULT 'member',
        "token"       varchar NOT NULL,
        "invited_by"  varchar,
        "accepted_at" timestamptz,
        "expires_at"  timestamptz NOT NULL,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_invitations_token" UNIQUE ("token")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_invitations_org_email" ON "invitations" ("org_id", "email")`);

    // feature_flags
    await queryRunner.query(`
      CREATE TABLE "feature_flags" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     varchar,
        "user_id"    varchar,
        "flag"       varchar NOT NULL,
        "enabled"    boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_feature_flags_org_user_flag" UNIQUE ("org_id", "user_id", "flag")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_feature_flags_org_flag" ON "feature_flags" ("org_id", "flag")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_feature_flags_global_flag" ON "feature_flags" ("flag") WHERE "org_id" IS NULL AND "user_id" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_feature_flags_org_flag_partial" ON "feature_flags" ("org_id", "flag") WHERE "org_id" IS NOT NULL AND "user_id" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_flags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invitations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orgs"`);
  }
}
