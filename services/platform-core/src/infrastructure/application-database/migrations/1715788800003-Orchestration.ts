import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Orchestration — creates orchestration/routing/sandbox tables:
 *   workflow_definitions, agent_runs, routing_rules, routing_drafts,
 *   routing_audit_events, agent_profiles, artifacts, edges
 */
export class Orchestration1715788800003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // workflow_definitions
    await queryRunner.query(`
      CREATE TABLE "workflow_definitions" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id"),
        "project_id"  varchar,
        "name"        varchar NOT NULL,
        "config_yaml" text NOT NULL,
        "prompt_md"   text NOT NULL,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_wf_def_org_project" ON "workflow_definitions" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_wf_def_org_project_name_unique" ON "workflow_definitions" ("org_id", COALESCE("project_id", '00000000-0000-0000-0000-000000000000'), "name")`);

    // agent_runs (references tasks, search_documents)
    await queryRunner.query(`
      CREATE TABLE "agent_runs" (
        "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"                  uuid NOT NULL REFERENCES "orgs" ("id"),
        "task_id"                 uuid REFERENCES "tasks" ("id"),
        "started_at"              timestamptz NOT NULL DEFAULT now(),
        "created_at"              timestamptz NOT NULL DEFAULT now(),
        "status"                  varchar,
        "orchestration_state"     varchar,
        "attempt_count"           integer NOT NULL DEFAULT 0,
        "next_retry_at"           timestamptz,
        "workspace_path"          text,
        "last_error_kind"         varchar,
        "sandbox_mode"            varchar NOT NULL DEFAULT 'host',
        "iteration_count"         integer NOT NULL DEFAULT 0,
        "token_used"              integer,
        "transcript_path"         varchar,
        "workspace_diff_path"     varchar,
        "transcript_truncated"    boolean NOT NULL DEFAULT false,
        "agent_name"              varchar,
        "agent_version"           varchar,
        "claimed_by"              varchar,
        "attempt_lifecycle_state" varchar,
        "last_codex_timestamp"    timestamptz,
        "thread_id"               varchar,
        "turn_id"                 varchar,
        "session_id"              varchar,
        "search_doc_id"           uuid REFERENCES "search_documents" ("id"),
        CONSTRAINT "agent_runs_claimed_task_id_check" CHECK ("orchestration_state" <> 'claimed' OR "task_id" IS NOT NULL)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_agent_runs_org_started" ON "agent_runs" ("org_id", "started_at")`);
    await queryRunner.query(`CREATE INDEX "agent_runs_agent_org" ON "agent_runs" ("org_id", "agent_name", "status", "created_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "agent_runs_claimed_unique" ON "agent_runs" ("task_id") WHERE "orchestration_state" = 'claimed'`);
    await queryRunner.query(`CREATE INDEX "agent_runs_dispatch_poll" ON "agent_runs" ("org_id", "orchestration_state", "next_retry_at") WHERE "orchestration_state" IN ('unclaimed', 'retry_pending')`);
    await queryRunner.query(`CREATE INDEX "agent_runs_stall_scan" ON "agent_runs" ("org_id", "orchestration_state", "last_codex_timestamp", "started_at") WHERE "orchestration_state" = 'running'`);

    // routing_rules
    await queryRunner.query(`
      CREATE TABLE "routing_rules" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"           uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"       varchar,
        "name"             varchar NOT NULL,
        "conditions_json"  jsonb NOT NULL DEFAULT '{}',
        "action_agent"     varchar NOT NULL,
        "action_skill_set" text NOT NULL DEFAULT '',
        "priority"         integer NOT NULL DEFAULT 100,
        "enabled"          boolean NOT NULL DEFAULT true,
        "source"           varchar NOT NULL DEFAULT 'manual',
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "routing_rules_org_priority" ON "routing_rules" ("org_id", "priority", "enabled")`);
    await queryRunner.query(`CREATE INDEX "routing_rules_org_project" ON "routing_rules" ("org_id", "project_id")`);

    // routing_drafts
    await queryRunner.query(`
      CREATE TABLE "routing_drafts" (
        "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"                      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"                  varchar,
        "status"                      varchar NOT NULL DEFAULT 'review_needed',
        "enabled"                     boolean NOT NULL DEFAULT false,
        "task_facts_json"             jsonb NOT NULL DEFAULT '{}',
        "no_match_reason"             text NOT NULL,
        "proposed_conditions_json"    jsonb NOT NULL DEFAULT '{}',
        "proposed_actions_json"       jsonb NOT NULL DEFAULT '{}',
        "source"                      varchar NOT NULL DEFAULT 'no_match',
        "confidence"                  float8 NOT NULL DEFAULT 0,
        "backend"                     varchar,
        "model"                       varchar,
        "matching_active_rule_ids_json" jsonb NOT NULL DEFAULT '[]',
        "created_at"                  timestamptz NOT NULL DEFAULT now(),
        "updated_at"                  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_routing_drafts_org_status" ON "routing_drafts" ("org_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_routing_drafts_org_created" ON "routing_drafts" ("org_id", "created_at")`);

    // routing_audit_events
    await queryRunner.query(`
      CREATE TABLE "routing_audit_events" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "event_type"   varchar NOT NULL,
        "subject_type" varchar NOT NULL,
        "subject_id"   varchar NOT NULL,
        "payload_json" jsonb NOT NULL DEFAULT '{}',
        "created_at"   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_routing_audit_org_created" ON "routing_audit_events" ("org_id", "created_at")`);

    // agent_profiles
    await queryRunner.query(`
      CREATE TABLE "agent_profiles" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "name"            varchar NOT NULL,
        "cli_path"        varchar,
        "skill_folder"    varchar,
        "default_flags"   text,
        "auth_env_vars"   text,
        "max_iterations"  integer NOT NULL DEFAULT 10,
        "default_timeout" integer NOT NULL DEFAULT 600000,
        "last_tested_at"  timestamptz,
        "test_passed"     boolean,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "agent_profiles_org_name" UNIQUE ("org_id", "name")
      )
    `);

    // artifacts
    await queryRunner.query(`
      CREATE TABLE "artifacts" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "run_id"          uuid NOT NULL REFERENCES "agent_runs" ("id") ON DELETE CASCADE,
        "task_id"         uuid REFERENCES "tasks" ("id") ON DELETE SET NULL,
        "project_id"      varchar,
        "filename"        varchar NOT NULL,
        "mime"            varchar,
        "size_bytes"      bigint,
        "path"            varchar NOT NULL,
        "checksum_sha256" varchar,
        "retention_until" timestamptz,
        "metadata_json"   jsonb,
        "created_at"      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_artifacts_org_path" ON "artifacts" ("org_id", "path")`);
    await queryRunner.query(`CREATE INDEX "artifacts_org_run" ON "artifacts" ("org_id", "run_id")`);
    await queryRunner.query(`CREATE INDEX "artifacts_org_task" ON "artifacts" ("org_id", "task_id")`);

    // edges
    await queryRunner.query(`
      CREATE TABLE "edges" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "from_kind"  varchar NOT NULL,
        "from_id"    varchar NOT NULL,
        "to_kind"    varchar NOT NULL,
        "to_id"      varchar NOT NULL,
        "kind"       varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "edges_from_to_kind" UNIQUE ("org_id", "from_kind", "from_id", "to_kind", "to_id", "kind")
      )
    `);
    await queryRunner.query(`CREATE INDEX "edges_to_lookup" ON "edges" ("org_id", "to_kind", "to_id", "kind")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "edges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "artifacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "routing_audit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "routing_drafts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "routing_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_definitions"`);
  }
}
