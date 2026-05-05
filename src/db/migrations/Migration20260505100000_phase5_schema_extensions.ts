/**
 * Migration: Phase 5 schema extensions — ALTER TABLE on existing tables.
 *
 * Runs FIRST (filename 100000). Extends existing tables so Migration 100001
 * (new tables) can safely reference columns added here.
 *
 * Tables extended: tasks, projects, sprints, metrics_cache, events, task_statuses.
 * Backfills included before NOT NULL constraints activate.
 * pg_trgm gracefully degrades if extension unavailable (T-05-03).
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260505100000_phase5_schema_extensions extends Migration {
  static isLossy = false;

  override async up(): Promise<void> {
    // ── tasks table extensions ────────────────────────────────────────────────
    this.addSql(`alter table "tasks" add column if not exists "due_date" date null`);
    this.addSql(`alter table "tasks" add column if not exists "start_date" date null`);
    this.addSql(`alter table "tasks" add column if not exists "started_at" timestamptz null`);
    this.addSql(`alter table "tasks" add column if not exists "assignee_id" uuid null`);
    this.addSql(`alter table "tasks" add column if not exists "labels" text[] not null default '{}'`);
    this.addSql(`alter table "tasks" add column if not exists "project_id" uuid null references "projects" ("id") on delete set null`);
    this.addSql(`alter table "tasks" add column if not exists "task_type" varchar(32) not null default 'task'`);
    this.addSql(`alter table "tasks" add column if not exists "sequence_number" integer null`);
    this.addSql(`alter table "tasks" add column if not exists "archived_at" timestamptz null`);
    // template_id FK added in Migration 100001 after task_templates table exists
    this.addSql(`alter table "tasks" add column if not exists "template_id" uuid null`);

    // Backfill before any NOT NULL enforcement
    this.addSql(`update "tasks" set "task_type" = 'task' where "task_type" is null`);

    // task_type check constraint
    this.addSql(`alter table "tasks" drop constraint if exists "tasks_task_type_check"`);
    this.addSql(`alter table "tasks" add constraint "tasks_task_type_check" check ("task_type" in ('epic','task','subtask','bug'))`);

    // Indexes on tasks
    this.addSql(
      `create unique index if not exists "projects_org_key" on "projects" ("org_id", "key") where "key" is not null`,
    );
    this.addSql(
      `create unique index if not exists "tasks_project_sequence" on "tasks" ("project_id", "sequence_number") where "sequence_number" is not null`,
    );
    this.addSql(
      `create index if not exists "tasks_archived" on "tasks" ("org_id", "archived_at") where "archived_at" is not null`,
    );

    // ── projects table extensions ─────────────────────────────────────────────
    this.addSql(`alter table "projects" add column if not exists "workflow_config" jsonb not null default '{}'::jsonb`);
    this.addSql(`alter table "projects" add column if not exists "methodology" varchar(32) not null default 'kanban'`);
    this.addSql(`alter table "projects" add column if not exists "enabled_task_types" jsonb not null default '["epic","task","subtask","bug"]'::jsonb`);
    this.addSql(`alter table "projects" add column if not exists "key" text null`);
    this.addSql(`alter table "projects" add column if not exists "task_sequence" integer not null default 0`);
    this.addSql(`alter table "projects" add column if not exists "estimation_scale" jsonb not null default '{"type":"linear","values":[1,2,3,4,5]}'::jsonb`);

    // Backfill
    this.addSql(`update "projects" set "methodology" = 'kanban' where "methodology" is null`);

    // methodology check constraint
    this.addSql(`alter table "projects" drop constraint if exists "projects_methodology_check"`);
    this.addSql(`alter table "projects" add constraint "projects_methodology_check" check ("methodology" in ('scrum','kanban','none'))`);

    // ── sprints table extensions ──────────────────────────────────────────────
    this.addSql(`alter table "sprints" add column if not exists "retrospective_notes" jsonb null`);
    this.addSql(`alter table "sprints" add column if not exists "closed_summary" jsonb null`);

    // ── metrics_cache table extensions (HIGH-01) ──────────────────────────────
    this.addSql(`alter table "metrics_cache" add column if not exists "scope_type" varchar(32) not null default 'sprint'`);
    this.addSql(`alter table "metrics_cache" drop constraint if exists "metrics_cache_scope_type_check"`);
    this.addSql(`alter table "metrics_cache" add constraint "metrics_cache_scope_type_check" check ("scope_type" in ('sprint','project','epic','workspace'))`);
    this.addSql(`alter table "metrics_cache" add column if not exists "points_total" integer not null default 0`);
    this.addSql(`alter table "metrics_cache" add column if not exists "tasks_total" integer not null default 0`);
    this.addSql(`alter table "metrics_cache" add column if not exists "status_counts" jsonb not null default '{}'::jsonb`);

    // ── events table extensions ───────────────────────────────────────────────
    this.addSql(`alter table "events" add column if not exists "field_name" varchar(255) null`);
    this.addSql(`alter table "events" add column if not exists "from_value" jsonb null`);
    this.addSql(`alter table "events" add column if not exists "to_value" jsonb null`);

    // ── task_statuses: extend category to include 'backlog' ───────────────────
    this.addSql(`alter table "task_statuses" drop constraint if exists "task_statuses_category_check"`);
    this.addSql(`alter table "task_statuses" add constraint "task_statuses_category_check" check ("category" in ('backlog','unstarted','started','completed','canceled'))`);

    // ── pg_trgm extension (D-118 — graceful fallback, T-05-03) ───────────────
    this.addSql(`
      do $$
      begin
        create extension if not exists pg_trgm;
      exception when insufficient_privilege or undefined_file then
        raise warning 'pg_trgm extension unavailable — duplicate detection will use ILIKE fallback';
      end $$;
    `);

    // GIN trgm index only if pg_trgm available
    this.addSql(`
      do $$
      begin
        create index if not exists "tasks_title_trgm" on "tasks" using gin ("title" gin_trgm_ops);
      exception when undefined_object then
        -- pg_trgm not available, skip GIN index
        null;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    // Reverse events
    this.addSql(`alter table "events" drop column if exists "field_name"`);
    this.addSql(`alter table "events" drop column if exists "from_value"`);
    this.addSql(`alter table "events" drop column if exists "to_value"`);

    // Reverse metrics_cache
    this.addSql(`alter table "metrics_cache" drop constraint if exists "metrics_cache_scope_type_check"`);
    this.addSql(`alter table "metrics_cache" drop column if exists "scope_type"`);
    this.addSql(`alter table "metrics_cache" drop column if exists "points_total"`);
    this.addSql(`alter table "metrics_cache" drop column if exists "tasks_total"`);
    this.addSql(`alter table "metrics_cache" drop column if exists "status_counts"`);

    // Reverse sprints
    this.addSql(`alter table "sprints" drop column if exists "retrospective_notes"`);
    this.addSql(`alter table "sprints" drop column if exists "closed_summary"`);

    // Reverse projects
    this.addSql(`alter table "projects" drop constraint if exists "projects_methodology_check"`);
    this.addSql(`alter table "projects" drop column if exists "workflow_config"`);
    this.addSql(`alter table "projects" drop column if exists "methodology"`);
    this.addSql(`alter table "projects" drop column if exists "enabled_task_types"`);
    this.addSql(`alter table "projects" drop column if exists "key"`);
    this.addSql(`alter table "projects" drop column if exists "task_sequence"`);
    this.addSql(`alter table "projects" drop column if exists "estimation_scale"`);

    // Reverse tasks
    this.addSql(`drop index if exists "tasks_title_trgm"`);
    this.addSql(`drop index if exists "tasks_archived"`);
    this.addSql(`drop index if exists "tasks_project_sequence"`);
    this.addSql(`alter table "tasks" drop constraint if exists "tasks_task_type_check"`);
    this.addSql(`alter table "tasks" drop column if exists "template_id"`);
    this.addSql(`alter table "tasks" drop column if exists "archived_at"`);
    this.addSql(`alter table "tasks" drop column if exists "sequence_number"`);
    this.addSql(`alter table "tasks" drop column if exists "task_type"`);
    this.addSql(`alter table "tasks" drop column if exists "project_id"`);
    this.addSql(`alter table "tasks" drop column if exists "labels"`);
    this.addSql(`alter table "tasks" drop column if exists "assignee_id"`);
    this.addSql(`alter table "tasks" drop column if exists "started_at"`);
    this.addSql(`alter table "tasks" drop column if exists "start_date"`);
    this.addSql(`alter table "tasks" drop column if exists "due_date"`);

    // Restore old category constraint
    this.addSql(`alter table "task_statuses" drop constraint if exists "task_statuses_category_check"`);
    this.addSql(`alter table "task_statuses" add constraint "task_statuses_category_check" check ("category" in ('unstarted','started','completed','cancelled'))`);
  }
}
