import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Platform — creates cross-cutting platform tables:
 *   credentials, domain_event_outbox, error_logs, experiment_assignment,
 *   feature_flag_rollouts, telemetry_events, telemetry_outbox, casbin_rule,
 *   notification_rules (flags stub), webhook_subscriptions, jobs, tenant_settings,
 *   schema_migrations, events, artifacts retention, model_cache, provider_credentials,
 *   skills, skill_versions, skill_conflicts, mcp_virtual_skills,
 *   audit_events, audit_exports
 */
export class Platform1715788800006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // events (core domain canonical audit log)
    await queryRunner.query(`
      CREATE TABLE "events" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id"),
        "user_id"      uuid REFERENCES "users" ("id"),
        "actor"        varchar,
        "project_id"   varchar,
        "verb"         varchar NOT NULL,
        "subject_kind" varchar NOT NULL,
        "subject_id"   varchar,
        "payload"      jsonb,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "field_name"   varchar,
        "from_value"   jsonb,
        "to_value"     jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_events_org_created" ON "events" ("org_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_events_subject" ON "events" ("org_id", "subject_kind", "subject_id", "created_at" DESC)`);

    // schema_migrations (audit ledger)
    await queryRunner.query(`
      CREATE TABLE "schema_migrations" (
        "version"    bigint PRIMARY KEY,
        "name"       varchar NOT NULL UNIQUE,
        "applied_at" timestamptz NOT NULL DEFAULT now(),
        "checksum"   varchar NOT NULL,
        "direction"  varchar NOT NULL
      )
    `);

    // credentials
    await queryRunner.query(`
      CREATE TABLE "credentials" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"         uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "name"            varchar NOT NULL,
        "encrypted_value" bytea NOT NULL,
        "algo"            varchar NOT NULL DEFAULT 'nacl-secretbox',
        "kdf"             varchar NOT NULL DEFAULT 'argon2id',
        "provider"        varchar NOT NULL DEFAULT 'local',
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "last_used_at"    timestamptz,
        "archived"        boolean NOT NULL,
        CONSTRAINT "uq_credentials_org_user_name" UNIQUE ("org_id", "user_id", "name")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_credentials_org_user_last_used" ON "credentials" ("org_id", "user_id", "last_used_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_credentials_org_archived" ON "credentials" ("org_id", "archived")`);

    // domain_event_outbox
    await queryRunner.query(`
      CREATE TABLE "domain_event_outbox" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"   varchar,
        "verb"         varchar NOT NULL,
        "subject_kind" varchar NOT NULL,
        "subject_id"   varchar,
        "event_key"    varchar NOT NULL,
        "payload"      jsonb NOT NULL DEFAULT '{}',
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz,
        "attempts"     integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX "domain_event_outbox_pending" ON "domain_event_outbox" ("processed_at", "created_at") WHERE "processed_at" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "domain_event_outbox_event_key_unique" ON "domain_event_outbox" ("event_key")`);

    // error_logs
    await queryRunner.query(`
      CREATE TABLE "error_logs" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"                uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"               uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "occurred_at"           timestamptz NOT NULL DEFAULT now(),
        "environment"           varchar,
        "app_version"           varchar,
        "recent_route"          varchar,
        "recent_trpc_procedure" varchar,
        "error_message"         text NOT NULL,
        "stack_trace"           text,
        "context"               jsonb NOT NULL DEFAULT '{}'
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_error_logs_org_occurred" ON "error_logs" ("org_id", "occurred_at" DESC)`);

    // experiment_assignment
    await queryRunner.query(`
      CREATE TABLE "experiment_assignment" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"        uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"       uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "experiment_id" varchar NOT NULL,
        "variant"       varchar NOT NULL,
        "assigned_at"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_experiment_assignment_org_user_experiment" UNIQUE ("org_id", "user_id", "experiment_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_experiment_assignment_org_experiment" ON "experiment_assignment" ("org_id", "experiment_id")`);

    // feature_flag_rollouts
    await queryRunner.query(`
      CREATE TABLE "feature_flag_rollouts" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "flag_id"         uuid NOT NULL REFERENCES "feature_flags" ("id") ON DELETE CASCADE,
        "rollout_percent" integer NOT NULL DEFAULT 100,
        "cohort_rules"    jsonb NOT NULL DEFAULT '{}',
        "updated_by"      uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_feature_flag_rollouts_org_flag" UNIQUE ("org_id", "flag_id"),
        CONSTRAINT "feature_flag_rollouts_rollout_percent_check" CHECK ("rollout_percent" >= 0 AND "rollout_percent" <= 100)
      )
    `);

    // telemetry_events
    await queryRunner.query(`
      CREATE TABLE "telemetry_events" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "user_id"     uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "kind"        varchar NOT NULL,
        "payload"     jsonb NOT NULL DEFAULT '{}',
        "occurred_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_telemetry_events_org_occurred" ON "telemetry_events" ("org_id", "occurred_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_telemetry_events_org_user_kind" ON "telemetry_events" ("org_id", "user_id", "kind")`);

    // telemetry_outbox
    await queryRunner.query(`
      CREATE TABLE "telemetry_outbox" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "batch_json" text NOT NULL,
        "attempts"   integer NOT NULL DEFAULT 0,
        "status"     varchar NOT NULL DEFAULT 'queued',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_telemetry_outbox_status" ON "telemetry_outbox" ("status")`);

    // casbin_rule
    await queryRunner.query(`
      CREATE TABLE "casbin_rule" (
        "id"    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ptype" varchar NOT NULL,
        "v0"    varchar,
        "v1"    varchar,
        "v2"    varchar,
        "v3"    varchar,
        "v4"    varchar,
        "v5"    varchar
      )
    `);

    // Note: notification_rules table created by 1715788800005-Notifications migration
    // The flags/NotificationRule entity maps to the same table

    // webhook_subscriptions (flags stub)
    await queryRunner.query(`
      CREATE TABLE "webhook_subscriptions" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"           uuid NOT NULL REFERENCES "orgs" ("id"),
        "active"           boolean NOT NULL,
        "url"              text NOT NULL,
        "encrypted_secret" text NOT NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_webhook_subscriptions_org_active" ON "webhook_subscriptions" ("org_id", "active")`);

    // jobs
    await queryRunner.query(`
      CREATE TABLE "jobs" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"        uuid NOT NULL REFERENCES "orgs" ("id"),
        "project_id"    varchar,
        "queue"         varchar NOT NULL DEFAULT 'default',
        "kind"          varchar NOT NULL DEFAULT 'generic',
        "payload"       jsonb NOT NULL DEFAULT '{}',
        "status"       varchar NOT NULL DEFAULT 'pending',
        "max_attempts" integer NOT NULL DEFAULT 3,
        "available_at"  timestamptz NOT NULL DEFAULT now(),
        "scheduled_for" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_jobs_org_status_scheduled" ON "jobs" ("org_id", "status", "scheduled_for")`);

    // tenant_settings
    await queryRunner.query(`
      CREATE TABLE "tenant_settings" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     varchar NOT NULL,
        "key"        varchar NOT NULL,
        "value"      jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_tenant_settings_org_key" UNIQUE ("org_id", "key")
      )
    `);
    await queryRunner.query(`CREATE INDEX "tenant_settings_org_key_idx" ON "tenant_settings" ("org_id", "key")`);

    // model_cache
    await queryRunner.query(`
      CREATE TABLE "model_cache" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id"),
        "model_id"    varchar NOT NULL,
        "kind"        varchar NOT NULL,
        "source"      varchar NOT NULL,
        "local_path"  varchar,
        "size_bytes"  bigint,
        "sha256"      varchar,
        "downloaded"  boolean NOT NULL DEFAULT false,
        "active"      boolean NOT NULL DEFAULT false,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "model_cache_org_model_id" UNIQUE ("org_id", "model_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "model_cache_org_kind_active" ON "model_cache" ("org_id", "kind", "active")`);

    // provider_credentials
    await queryRunner.query(`
      CREATE TABLE "provider_credentials" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id"),
        "provider"   varchar NOT NULL,
        "base_url"   varchar NOT NULL,
        "secret_ref" varchar,
        "active"     boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`CREATE INDEX "provider_credentials_org_provider_active" ON "provider_credentials" ("org_id", "provider", "active")`);

    // artifact_retention_policies
    await queryRunner.query(`
      CREATE TABLE "artifact_retention_policies" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"               uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"           uuid REFERENCES "projects" ("id") ON DELETE CASCADE,
        "scope_kind"           varchar NOT NULL DEFAULT 'project',
        "artifact_kind"        varchar NOT NULL,
        "retention_days"       integer,
        "keep_latest_per_ref"  boolean NOT NULL DEFAULT true,
        "keep_pinned"          boolean NOT NULL DEFAULT true,
        "enabled"              boolean NOT NULL DEFAULT true,
        "notes"                text,
        "created_by"           varchar,
        "created_at"           timestamptz NOT NULL DEFAULT now(),
        "updated_at"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_artifact_retention_policies_scope" UNIQUE ("org_id", "project_id", "scope_kind", "artifact_kind")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_artifact_retention_policies_org" ON "artifact_retention_policies" ("org_id")`);
    await queryRunner.query(`CREATE INDEX "idx_artifact_retention_policies_artifact_kind" ON "artifact_retention_policies" ("artifact_kind")`);

    // audit_events
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"   varchar NOT NULL,
        "actor_id"     varchar NOT NULL,
        "action"       varchar NOT NULL,
        "subject_kind" varchar NOT NULL,
        "subject_id"   varchar NOT NULL,
        "payload"      jsonb NOT NULL DEFAULT '{}',
        "created_at"   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "audit_events_org_project_created" ON "audit_events" ("org_id", "project_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "audit_events_subject" ON "audit_events" ("org_id", "subject_kind", "subject_id")`);

    // audit_exports
    await queryRunner.query(`
      CREATE TABLE "audit_exports" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"               uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"           varchar NOT NULL,
        "requested_by_user_id" varchar NOT NULL,
        "status"               varchar NOT NULL,
        "format"               varchar NOT NULL,
        "filters"              jsonb NOT NULL DEFAULT '{}',
        "download_url"         varchar,
        "created_at"           timestamptz NOT NULL DEFAULT now(),
        "updated_at"           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "audit_exports_org_project" ON "audit_exports" ("org_id", "project_id")`);

    // fulcrum_skills
    await queryRunner.query(`
      CREATE TABLE "fulcrum_skills" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "name"            varchar NOT NULL,
        "slug"            varchar NOT NULL,
        "source"          varchar NOT NULL,
        "upstream_repo"   varchar,
        "upstream_ref"    varchar,
        "enabled_agents"  jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "fulcrum_skills_org_slug" UNIQUE ("org_id", "slug")
      )
    `);

    // skill_versions
    await queryRunner.query(`
      CREATE TABLE "skill_versions" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "skill_id"      uuid NOT NULL REFERENCES "fulcrum_skills" ("id") ON DELETE CASCADE,
        "version"       varchar NOT NULL,
        "hash_verified" varchar
      )
    `);

    // mcp_virtual_skills
    await queryRunner.query(`
      CREATE TABLE "mcp_virtual_skills" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"        varchar NOT NULL,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now(),
        "description" varchar,
        "vendor"      varchar,
        CONSTRAINT "mcp_virtual_skills_slug" UNIQUE ("slug")
      )
    `);

    // skill_conflicts
    await queryRunner.query(`
      CREATE TABLE "skill_conflicts" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"       varchar NOT NULL,
        "kind"       varchar NOT NULL,
        "status"     varchar NOT NULL DEFAULT 'open',
        "audit_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_conflicts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_virtual_skills"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fulcrum_skills"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_exports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "artifact_retention_policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "model_cache"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "casbin_rule"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_outbox"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_flag_rollouts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "experiment_assignment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "error_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "domain_event_outbox"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schema_migrations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "events"`);
  }
}
