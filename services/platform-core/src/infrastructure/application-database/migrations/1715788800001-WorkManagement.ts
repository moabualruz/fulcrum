import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * WorkManagement — creates work management tables:
 *   projects, task_statuses, sprints, tasks, task_comments, comment_reactions,
 *   task_watchers, task_relationships, task_templates, custom_field_defs,
 *   saved_views, field_dependency_rules, project_automations,
 *   task_recurrence_rules, yjs_snapshots, metrics_cache
 */
export class WorkManagement1715788800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // projects
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"            uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "name"              varchar NOT NULL,
        "workflow_config"   jsonb,
        "methodology"       varchar,
        "enabled_task_types" jsonb,
        "slug"              varchar,
        "description"       text,
        "parent_id"         uuid REFERENCES "projects" ("id") ON DELETE SET NULL,
        "kind"              varchar NOT NULL DEFAULT 'project',
        "path"              varchar,
        "depth"             integer NOT NULL DEFAULT 0,
        "module_policy"     jsonb NOT NULL DEFAULT '{}',
        "template_id"       varchar,
        "workflow_id"       varchar,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      )
    `);

    // task_statuses
    await queryRunner.query(`
      CREATE TABLE "task_statuses" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id" varchar NOT NULL,
        "name"       varchar NOT NULL,
        "color"      varchar NOT NULL DEFAULT '#6B7280',
        "category"   varchar NOT NULL,
        "position"   integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        CONSTRAINT "task_statuses_project_name_unique" UNIQUE ("project_id", "name"),
        CONSTRAINT "task_status_category_check" CHECK ("category" IN ('unstarted','started','completed','cancelled'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "task_statuses_org_project" ON "task_statuses" ("org_id", "project_id")`);

    // sprints
    await queryRunner.query(`
      CREATE TABLE "sprints" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"           uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"       varchar NOT NULL,
        "name"             varchar NOT NULL,
        "goal"             text,
        "start_date"       date NOT NULL,
        "end_date"         date NOT NULL,
        "status"           varchar NOT NULL DEFAULT 'planned',
        "capacity_points"  integer,
        "closed_at"        timestamptz,
        "metrics_snapshot" jsonb,
        "retro_doc_id"     varchar,
        "retrospective_notes" jsonb,
        "closed_summary"   jsonb,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "sprints_status_check" CHECK ("status" IN ('planned','active','completed'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "sprints_org_project_status" ON "sprints" ("org_id", "project_id", "status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints" ("project_id") WHERE "status" = 'active'`);

    // tasks
    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id"),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "title"           varchar NOT NULL DEFAULT 'Untitled task',
        "description"     text,
        "tiptap_content"  jsonb NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
        "blocked_by_ids"  text NOT NULL DEFAULT '',
        "workflow_id"     varchar,
        "status"          varchar,
        "priority"        integer,
        "sprint_id"       varchar,
        "custom_fields"   jsonb NOT NULL DEFAULT '{}',
        "points"          integer,
        "parent_id"       uuid REFERENCES "tasks" ("id") ON DELETE SET NULL,
        "dependencies"    jsonb NOT NULL DEFAULT '{"blocks":[],"blocked_by":[]}'::jsonb,
        "external_id"     varchar,
        "repo_id"         uuid,
        "deleted_at"      timestamptz,
        "due_date"        date,
        "start_date"      date,
        "started_at"      timestamptz,
        "assignee_id"     varchar,
        "labels"          text NOT NULL DEFAULT '',
        "project_id"      varchar,
        "task_type"       varchar NOT NULL DEFAULT 'task',
        "sequence_number" integer,
        "archived_at"     timestamptz,
        "template_id"     varchar
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_tasks_org_created" ON "tasks" ("org_id", "created_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "tasks_id_org_unique" ON "tasks" ("id", "org_id")`);
    await queryRunner.query(`CREATE INDEX "tasks_org_sprint_status" ON "tasks" ("org_id", "sprint_id", "status")`);
    await queryRunner.query(`CREATE INDEX "tasks_org_parent" ON "tasks" ("org_id", "parent_id")`);
    await queryRunner.query(`CREATE INDEX "tasks_custom_fields_gin" ON "tasks" USING gin ("custom_fields")`);
    await queryRunner.query(`CREATE INDEX "tasks_dependencies_gin" ON "tasks" USING gin ("dependencies")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "tasks_org_external_id" ON "tasks" ("org_id", "external_id") WHERE "external_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "tasks_org_repo" ON "tasks" ("org_id", "repo_id") WHERE "repo_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "tasks_dispatch_eligible" ON "tasks" ("org_id", "status", "priority", "created_at") WHERE "status" = 'ready'`);

    // task_comments
    await queryRunner.query(`
      CREATE TABLE "task_comments" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"            uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "task_id"           varchar NOT NULL,
        "author_id"         varchar NOT NULL,
        "body"              jsonb,
        "parent_comment_id" varchar,
        "resolved"          boolean NOT NULL DEFAULT false,
        "resolved_by"       varchar,
        "resolved_at"       timestamptz,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "task_comments_task_id" ON "task_comments" ("task_id")`);
    await queryRunner.query(`CREATE INDEX "task_comments_org_task" ON "task_comments" ("org_id", "task_id")`);

    // comment_reactions
    await queryRunner.query(`
      CREATE TABLE "comment_reactions" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "comment_id" varchar NOT NULL,
        "user_id"    varchar NOT NULL,
        "emoji"      varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_comment_reactions_comment_user_emoji" UNIQUE ("comment_id", "user_id", "emoji")
      )
    `);
    await queryRunner.query(`CREATE INDEX "comment_reactions_comment_id" ON "comment_reactions" ("comment_id")`);

    // task_watchers
    await queryRunner.query(`
      CREATE TABLE "task_watchers" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "task_id"    varchar NOT NULL,
        "user_id"    varchar NOT NULL,
        "source"     varchar NOT NULL DEFAULT 'manual',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "task_watchers_task_user_uniq" UNIQUE ("task_id", "user_id")
      )
    `);

    // task_relationships
    await queryRunner.query(`
      CREATE TABLE "task_relationships" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"         uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "source_task_id" varchar NOT NULL,
        "target_task_id" varchar NOT NULL,
        "type"           varchar NOT NULL,
        "created_by"     varchar NOT NULL,
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "task_relationships_uniq" UNIQUE ("source_task_id", "target_task_id", "type")
      )
    `);
    await queryRunner.query(`CREATE INDEX "task_relationships_source" ON "task_relationships" ("source_task_id")`);
    await queryRunner.query(`CREATE INDEX "task_relationships_target" ON "task_relationships" ("target_task_id")`);

    // task_templates
    await queryRunner.query(`
      CREATE TABLE "task_templates" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"        uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"    varchar,
        "name"          varchar NOT NULL,
        "description"   text,
        "template_data" jsonb,
        "is_default"    boolean NOT NULL DEFAULT false,
        "created_by"    varchar NOT NULL,
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "task_templates_org_project" ON "task_templates" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "task_templates_one_default_per_project" ON "task_templates" ("org_id", "project_id") WHERE "is_default" = true`);

    // custom_field_defs
    await queryRunner.query(`
      CREATE TABLE "custom_field_defs" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"  varchar NOT NULL,
        "name"        varchar NOT NULL,
        "slug"        varchar NOT NULL,
        "type"        varchar NOT NULL,
        "config_json" jsonb NOT NULL DEFAULT '{}',
        "required"    boolean NOT NULL DEFAULT false,
        "archived"    boolean NOT NULL DEFAULT false,
        "position"    integer NOT NULL DEFAULT 0,
        CONSTRAINT "custom_field_defs_project_slug_unique" UNIQUE ("project_id", "slug")
      )
    `);
    await queryRunner.query(`CREATE INDEX "custom_field_defs_org_project" ON "custom_field_defs" ("org_id", "project_id")`);

    // saved_views
    await queryRunner.query(`
      CREATE TABLE "saved_views" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"             uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"         varchar,
        "scope"              varchar NOT NULL DEFAULT 'private',
        "name"               varchar NOT NULL,
        "query_json"         jsonb NOT NULL DEFAULT '{}',
        "order_by"           jsonb NOT NULL DEFAULT '[]',
        "view_type"          varchar NOT NULL DEFAULT 'list',
        "created_by"         varchar NOT NULL,
        "shared_with_users"  text NOT NULL DEFAULT '',
        "shared_with_teams"  text NOT NULL DEFAULT '',
        "default_for"        varchar,
        "created_at"         timestamptz NOT NULL DEFAULT now(),
        "updated_at"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "saved_views_scope_check" CHECK ("scope" IN ('private','project','org')),
        CONSTRAINT "saved_views_view_type_check" CHECK ("view_type" IN ('kanban','table','calendar','timeline','list','search'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "saved_views_org_project" ON "saved_views" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE INDEX "saved_views_created_by" ON "saved_views" ("created_by")`);
    await queryRunner.query(`CREATE INDEX "saved_searches_org_user" ON "saved_views" ("org_id", "created_by")`);

    // field_dependency_rules
    await queryRunner.query(`
      CREATE TABLE "field_dependency_rules" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"      varchar NOT NULL,
        "source_field_id" varchar NOT NULL,
        "source_value"    varchar NOT NULL,
        "target_field_id" varchar NOT NULL,
        "action"          varchar NOT NULL,
        "created_at"      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "field_dependency_rules_project" ON "field_dependency_rules" ("project_id")`);

    // project_automations
    await queryRunner.query(`
      CREATE TABLE "project_automations" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"      varchar NOT NULL,
        "name"            varchar NOT NULL,
        "trigger_type"    varchar NOT NULL,
        "trigger_config"  jsonb NOT NULL DEFAULT '{}',
        "condition"       jsonb,
        "action_type"     varchar NOT NULL,
        "action_config"   jsonb NOT NULL DEFAULT '{}',
        "enabled"         boolean NOT NULL DEFAULT true,
        "execution_count" integer NOT NULL DEFAULT 0,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "project_automations_project_enabled" ON "project_automations" ("project_id", "enabled")`);

    // task_recurrence_rules
    await queryRunner.query(`
      CREATE TABLE "task_recurrence_rules" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"               uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "source_task_id"       varchar NOT NULL,
        "trigger_type"         varchar NOT NULL,
        "cron_expression"      varchar,
        "interval_days"        integer,
        "timezone"             varchar NOT NULL DEFAULT 'UTC',
        "template_data"        jsonb,
        "include_subtasks"     boolean NOT NULL DEFAULT false,
        "start_date"           date,
        "end_date"             date,
        "max_occurrences"      integer,
        "occurrences_created"  integer NOT NULL DEFAULT 0,
        "next_run_at"          timestamptz,
        "last_run_at"          timestamptz,
        "enabled"              boolean NOT NULL DEFAULT true,
        "created_at"           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "task_recurrence_rules_next_run_enabled" ON "task_recurrence_rules" ("next_run_at") WHERE "enabled" = true`);

    // yjs_snapshots
    await queryRunner.query(`
      CREATE TABLE "yjs_snapshots" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "doc_name"   varchar NOT NULL UNIQUE,
        "state"      bytea NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "yjs_snapshots_doc_name_unique" UNIQUE ("doc_name")
      )
    `);

    // metrics_cache
    await queryRunner.query(`
      CREATE TABLE "metrics_cache" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id"       varchar NOT NULL,
        "sprint_id"        uuid REFERENCES "sprints" ("id") ON DELETE CASCADE,
        "date"             date NOT NULL,
        "started_count"    integer NOT NULL DEFAULT 0,
        "completed_count"  integer NOT NULL DEFAULT 0,
        "blocked_count"    integer NOT NULL DEFAULT 0,
        "points_completed" integer NOT NULL DEFAULT 0,
        "points_remaining" integer NOT NULL DEFAULT 0,
        "wip_count"        integer NOT NULL DEFAULT 0,
        "scope_type"       varchar NOT NULL DEFAULT 'sprint',
        "points_total"     integer NOT NULL DEFAULT 0,
        "tasks_total"      integer NOT NULL DEFAULT 0,
        "status_counts"    jsonb NOT NULL DEFAULT '{}',
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "metrics_cache_project_sprint_date_unique" UNIQUE ("project_id", "sprint_id", "date")
      )
    `);
    await queryRunner.query(`CREATE INDEX "metrics_cache_project_sprint_date" ON "metrics_cache" ("project_id", "sprint_id", "date")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "metrics_cache"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "yjs_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_recurrence_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_automations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "field_dependency_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_views"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_field_defs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_relationships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_watchers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comment_reactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sprints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_statuses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
  }
}
