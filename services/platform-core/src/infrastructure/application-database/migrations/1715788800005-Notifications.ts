import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Notifications — creates notification/webhook tables:
 *   user_notifications, notification_deliveries, notification_mutes,
 *   notification_quiet_hours, notification_rules, push_subscriptions,
 *   webhooks, webhook_deliveries, webhook_rule_configs, event_retention_policy
 */
export class Notifications1715788800005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // notification_rules (notifications domain — full expansion)
    await queryRunner.query(`
      CREATE TABLE "notification_rules" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"        uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"       varchar,
        "subject_kind"  varchar,
        "active"        boolean NOT NULL DEFAULT true,
        "name"          varchar,
        "event_pattern" jsonb,
        "channels"      text,
        "enabled"       boolean NOT NULL DEFAULT true,
        "created_at"    timestamptz,
        "updated_at"    timestamptz,
        CONSTRAINT "uq_notification_rules_user_name" UNIQUE ("user_id", "name")
      )
    `);
    await queryRunner.query(`CREATE INDEX "notification_rules_org_user" ON "notification_rules" ("org_id", "user_id")`);
    await queryRunner.query(`CREATE INDEX "notification_rules_org_enabled" ON "notification_rules" ("org_id", "enabled")`);

    // user_notifications
    await queryRunner.query(`
      CREATE TABLE "user_notifications" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"     varchar NOT NULL,
        "rule_id"     varchar,
        "event_id"    varchar NOT NULL,
        "title"       varchar NOT NULL,
        "body"        text NOT NULL DEFAULT '',
        "entity_kind" varchar NOT NULL,
        "entity_id"   varchar NOT NULL,
        "read_at"     timestamptz,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_user_notifications_user_event_rule" UNIQUE ("user_id", "event_id", "rule_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_user_notifications_org_user_read" ON "user_notifications" ("org_id", "user_id", "read_at")`);
    await queryRunner.query(`CREATE INDEX "idx_user_notifications_org_user_created" ON "user_notifications" ("org_id", "user_id", "created_at")`);

    // notification_deliveries
    await queryRunner.query(`
      CREATE TABLE "notification_deliveries" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "rule_id"         varchar NOT NULL,
        "notification_id" varchar,
        "user_id"         varchar NOT NULL,
        "channel"         varchar NOT NULL,
        "status"          varchar NOT NULL DEFAULT 'pending',
        "attempt_count"   integer NOT NULL DEFAULT 0,
        "last_error"      text,
        "payload"         jsonb NOT NULL DEFAULT '{}',
        "sent_at"         timestamptz,
        "retry_after"     timestamptz,
        "created_at"      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_nd_org_user_channel_status" ON "notification_deliveries" ("org_id", "user_id", "channel", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_nd_retry_after" ON "notification_deliveries" ("retry_after")`);

    // notification_mutes
    await queryRunner.query(`
      CREATE TABLE "notification_mutes" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"      varchar NOT NULL,
        "subject_kind" varchar NOT NULL,
        "subject_id"   varchar NOT NULL,
        "muted_until"  timestamptz,
        CONSTRAINT "uq_notification_mutes_user_subject" UNIQUE ("user_id", "subject_kind", "subject_id")
      )
    `);

    // notification_quiet_hours
    await queryRunner.query(`
      CREATE TABLE "notification_quiet_hours" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"      varchar NOT NULL,
        "timezone"     varchar NOT NULL DEFAULT 'UTC',
        "start_hour"   integer NOT NULL,
        "end_hour"     integer NOT NULL,
        "days_of_week" text NOT NULL DEFAULT '0,1,2,3,4,5,6',
        CONSTRAINT "uq_notification_quiet_hours_user" UNIQUE ("user_id")
      )
    `);

    // event_retention_policy
    await queryRunner.query(`
      CREATE TABLE "event_retention_policy" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"   varchar,
        "retain_days"  integer NOT NULL DEFAULT 0,
        CONSTRAINT "uq_event_retention_policy_org_project" UNIQUE ("org_id", "project_id")
      )
    `);

    // push_subscriptions
    await queryRunner.query(`
      CREATE TABLE "push_subscriptions" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"    varchar NOT NULL,
        "endpoint"   text NOT NULL,
        "p256dh"     text NOT NULL,
        "auth"       text NOT NULL,
        "user_agent" text,
        CONSTRAINT "uq_push_subscriptions_user_endpoint" UNIQUE ("user_id", "endpoint")
      )
    `);

    // webhooks
    await queryRunner.query(`
      CREATE TABLE "webhooks" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"           uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "name"             varchar NOT NULL,
        "url"              text NOT NULL,
        "encrypted_secret" text,
        "enabled"          boolean NOT NULL DEFAULT true,
        "event_types"      text NOT NULL DEFAULT '',
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        "last_delivery_at" timestamptz,
        CONSTRAINT "uq_webhooks_org_name" UNIQUE ("org_id", "name")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_webhooks_org_enabled" ON "webhooks" ("org_id", "enabled")`);

    // webhook_deliveries
    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"         uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "webhook_id"     uuid NOT NULL REFERENCES "webhooks" ("id") ON DELETE CASCADE,
        "event_id"       varchar,
        "status"         varchar NOT NULL DEFAULT 'pending',
        "attempt"        integer NOT NULL DEFAULT 1,
        "payload"        jsonb,
        "response_code"  integer,
        "error"          text,
        "next_retry_at"  timestamptz,
        "created_at"     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_wd_org_webhook_status" ON "webhook_deliveries" ("org_id", "webhook_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_wd_next_retry" ON "webhook_deliveries" ("next_retry_at")`);

    // webhook_rule_configs
    await queryRunner.query(`
      CREATE TABLE "webhook_rule_configs" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"           uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "rule_id"          varchar NOT NULL,
        "url"              text NOT NULL,
        "encrypted_secret" text NOT NULL,
        CONSTRAINT "uq_webhook_rule_configs_rule" UNIQUE ("rule_id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_rule_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhooks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "event_retention_policy"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_quiet_hours"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_mutes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_rules"`);
  }
}
