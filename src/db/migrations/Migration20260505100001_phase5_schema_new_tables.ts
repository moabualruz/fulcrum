/**
 * Migration: Phase 5 new tables — CREATE TABLE for all 9 new entities.
 *
 * Runs SECOND (filename 100001), after Migration 100000 has extended existing
 * tables. References tasks.template_id added in migration 100000 is wired here
 * as a deferred FK once task_templates exists.
 *
 * New tables: task_comments, comment_reactions, task_watchers, task_relationships,
 * project_automations, field_dependency_rules, yjs_snapshots, task_templates,
 * task_recurrence_rules.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260505100001_phase5_schema_new_tables extends Migration {
  static isLossy = false;

  override async up(): Promise<void> {
    // 1. task_comments
    this.addSql(`
      create table "task_comments" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "task_id" uuid not null,
        "author_id" uuid not null,
        "body" jsonb not null default '{}',
        "parent_comment_id" uuid null,
        "resolved" boolean not null default false,
        "resolved_by" uuid null,
        "resolved_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);
    this.addSql(`alter table "task_comments" add constraint "task_comments_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`alter table "task_comments" add constraint "task_comments_parent_foreign" foreign key ("parent_comment_id") references "task_comments" ("id") on delete cascade`);
    this.addSql(`create index "task_comments_task_id" on "task_comments" ("task_id")`);
    this.addSql(`create index "task_comments_org_task" on "task_comments" ("org_id", "task_id")`);

    // 2. comment_reactions
    this.addSql(`
      create table "comment_reactions" (
        "id" uuid not null default gen_random_uuid(),
        "comment_id" uuid not null,
        "user_id" uuid not null,
        "emoji" varchar(8) not null,
        "created_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);
    this.addSql(`alter table "comment_reactions" add constraint "comment_reactions_comment_id_foreign" foreign key ("comment_id") references "task_comments" ("id") on delete cascade`);
    this.addSql(`create unique index "comment_reactions_uniq" on "comment_reactions" ("comment_id", "user_id", "emoji")`);

    // 3. task_watchers
    this.addSql(`
      create table "task_watchers" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "task_id" uuid not null,
        "user_id" uuid not null,
        "source" varchar(32) not null default 'manual',
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        constraint "task_watchers_source_check" check ("source" in ('manual','mention','assign','create'))
      )
    `);
    this.addSql(`alter table "task_watchers" add constraint "task_watchers_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create unique index "task_watchers_task_user_uniq" on "task_watchers" ("task_id", "user_id")`);

    // 4. task_relationships
    this.addSql(`
      create table "task_relationships" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "source_task_id" uuid not null,
        "target_task_id" uuid not null,
        "type" varchar(32) not null,
        "created_by" uuid not null,
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        constraint "task_relationships_type_check" check ("type" in ('blocks','relates_to','duplicate_of'))
      )
    `);
    this.addSql(`alter table "task_relationships" add constraint "task_relationships_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create unique index "task_relationships_uniq" on "task_relationships" ("source_task_id", "target_task_id", "type")`);
    this.addSql(`create index "task_relationships_source" on "task_relationships" ("source_task_id")`);
    this.addSql(`create index "task_relationships_target" on "task_relationships" ("target_task_id")`);

    // 5. project_automations
    this.addSql(`
      create table "project_automations" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "project_id" uuid not null,
        "name" varchar(255) not null,
        "trigger_type" varchar(255) not null,
        "trigger_config" jsonb not null default '{}',
        "condition" jsonb null,
        "action_type" varchar(255) not null,
        "action_config" jsonb not null default '{}',
        "enabled" boolean not null default true,
        "execution_count" integer not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);
    this.addSql(`alter table "project_automations" add constraint "project_automations_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index "project_automations_project_enabled" on "project_automations" ("project_id", "enabled")`);

    // 6. field_dependency_rules
    this.addSql(`
      create table "field_dependency_rules" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "project_id" uuid not null,
        "source_field_id" uuid not null,
        "source_value" varchar(255) not null,
        "target_field_id" uuid not null,
        "action" varchar(32) not null,
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        constraint "field_dependency_rules_action_check" check ("action" in ('show','hide','require'))
      )
    `);
    this.addSql(`alter table "field_dependency_rules" add constraint "field_dependency_rules_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index "field_dependency_rules_project" on "field_dependency_rules" ("project_id")`);

    // 7. yjs_snapshots (HIGH-05)
    this.addSql(`
      create table "yjs_snapshots" (
        "id" uuid not null default gen_random_uuid(),
        "doc_name" varchar(255) not null,
        "state" bytea not null,
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);
    this.addSql(`create unique index "yjs_snapshots_doc_name_uniq" on "yjs_snapshots" ("doc_name")`);

    // 8. task_templates (D-115)
    this.addSql(`
      create table "task_templates" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "project_id" uuid null,
        "name" text not null,
        "description" text null,
        "template_data" jsonb not null default '{}',
        "is_default" boolean not null default false,
        "created_by" uuid not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);
    this.addSql(`alter table "task_templates" add constraint "task_templates_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`alter table "task_templates" add constraint "task_templates_project_id_foreign" foreign key ("project_id") references "projects" ("id") on delete cascade`);
    this.addSql(`create index "task_templates_org_project" on "task_templates" ("org_id", "project_id")`);
    this.addSql(`create unique index "task_templates_one_default_per_project" on "task_templates" ("org_id", "project_id") where "is_default" = true`);

    // 9. task_recurrence_rules (D-116)
    this.addSql(`
      create table "task_recurrence_rules" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "source_task_id" uuid not null,
        "trigger_type" text not null,
        "cron_expression" text null,
        "interval_days" integer null,
        "timezone" text not null default 'UTC',
        "template_data" jsonb not null default '{}',
        "include_subtasks" boolean not null default false,
        "start_date" date null,
        "end_date" date null,
        "max_occurrences" integer null,
        "occurrences_created" integer not null default 0,
        "next_run_at" timestamptz null,
        "last_run_at" timestamptz null,
        "enabled" boolean not null default true,
        "created_at" timestamptz not null default now(),
        primary key ("id"),
        constraint "task_recurrence_rules_trigger_type_check" check ("trigger_type" in ('schedule','on_complete'))
      )
    `);
    this.addSql(`alter table "task_recurrence_rules" add constraint "task_recurrence_rules_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`alter table "task_recurrence_rules" add constraint "task_recurrence_rules_source_task_id_foreign" foreign key ("source_task_id") references "tasks" ("id") on delete cascade`);
    this.addSql(`create index "task_recurrence_rules_next_run_enabled" on "task_recurrence_rules" ("next_run_at") where "enabled" = true`);

    // Deferred FK: tasks.template_id -> task_templates (added in migration 100000, wired here)
    this.addSql(`alter table "tasks" add constraint "tasks_template_id_fk" foreign key ("template_id") references "task_templates" ("id") on delete set null`);
  }

  override async down(): Promise<void> {
    // Drop deferred FK first
    this.addSql(`alter table "tasks" drop constraint if exists "tasks_template_id_fk"`);

    // Drop new tables in reverse dependency order
    this.addSql(`drop table if exists "task_recurrence_rules" cascade`);
    this.addSql(`drop table if exists "task_templates" cascade`);
    this.addSql(`drop table if exists "yjs_snapshots" cascade`);
    this.addSql(`drop table if exists "field_dependency_rules" cascade`);
    this.addSql(`drop table if exists "project_automations" cascade`);
    this.addSql(`drop table if exists "task_relationships" cascade`);
    this.addSql(`drop table if exists "task_watchers" cascade`);
    this.addSql(`drop table if exists "comment_reactions" cascade`);
    this.addSql(`drop table if exists "task_comments" cascade`);
  }
}
