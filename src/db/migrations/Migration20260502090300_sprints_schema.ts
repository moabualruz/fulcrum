/**
 * Migration: Sprint schema + at-most-one-active DB invariant.
 *
 * Project table ownership is separate from this slice. When `projects` already
 * exists, this migration attaches the cascade FK; otherwise `project_id` remains
 * ready for the owning project-schema migration to constrain.
 *
 * Closes (issue): .scratch/agent-os-vision/06-tasks-and-scrum/issues/02-sprints-schema.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502090300_sprints_schema extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "sprints" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "project_id" uuid not null, "name" varchar(255) not null, "goal" text null, "start_date" date not null, "end_date" date not null, "status" varchar(255) not null default 'planned', "capacity_points" integer null, "closed_at" timestamptz null, "metrics_snapshot" jsonb null, "retro_doc_id" uuid null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "sprints_status_check" check ("status" in ('planned','active','completed')), primary key ("id"))`,
    );
    this.addSql(`alter table "sprints" add column if not exists "updated_at" timestamptz not null default now()`);
    this.addSql(`alter table "sprints" add column if not exists "closed_at" timestamptz null`);
    this.addSql(`alter table "sprints" add column if not exists "metrics_snapshot" jsonb null`);
    this.addSql(`alter table "sprints" add column if not exists "retro_doc_id" uuid null`);
    this.addSql(
      `do $$ begin if not exists (select 1 from pg_constraint where conname = 'sprints_org_id_foreign') then alter table "sprints" add constraint "sprints_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade; end if; end $$`,
    );
    this.addSql(
      `do $$ begin if to_regclass('public.projects') is not null and not exists (select 1 from pg_constraint where conname = 'sprints_project_id_foreign') then alter table "sprints" add constraint "sprints_project_id_foreign" foreign key ("project_id") references "projects" ("id") on delete cascade; end if; end $$`,
    );
    this.addSql(
      `create index if not exists "sprints_org_project_status" on "sprints" ("org_id", "project_id", "status")`,
    );
    this.addSql(
      `create unique index if not exists "sprints_one_active_per_project" on "sprints" ("project_id") where "status" = 'active'`,
    );
    this.addSql(
      `do $$ begin if to_regclass('public.tasks') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'sprint_id') and not exists (select 1 from pg_constraint where conname = 'tasks_sprint_id_foreign') then alter table "tasks" add constraint "tasks_sprint_id_foreign" foreign key ("sprint_id") references "sprints" ("id") on delete set null; end if; end $$`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "tasks" drop constraint if exists "tasks_sprint_id_foreign"`,
    );
    this.addSql(`drop index if exists "sprints_one_active_per_project"`);
    this.addSql(`drop index if exists "sprints_org_project_status"`);
    this.addSql(`drop table if exists "sprints" cascade`);
  }
}
