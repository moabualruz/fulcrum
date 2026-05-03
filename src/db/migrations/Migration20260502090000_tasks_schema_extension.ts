/**
 * Migration: Task schema extension + TaskStatus.
 *
 * Adds Pillar 6 task fields and task status configuration. The `sprints`
 * table is owned by P6#02 and may merge before or after this slice, so the
 * sprint FK is installed only when that table already exists.
 *
 * Closes (issue): .scratch/agent-os-vision/06-tasks-and-scrum/issues/01-tasks-schema-extension.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502090000_tasks_schema_extension extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "tasks" add column if not exists "updated_at" timestamptz not null default now()`);
    this.addSql(`alter table "tasks" add column if not exists "title" varchar(255) not null default 'Untitled task'`);
    this.addSql(`alter table "tasks" add column if not exists "description" text null`);
    this.addSql(
      `alter table "tasks" add column if not exists "tiptap_content" jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb`,
    );
    this.addSql(`alter table "tasks" add column if not exists "deleted_at" timestamptz null`);
    this.addSql(`alter table "tasks" add column "sprint_id" uuid null`);
    this.addSql(
      `alter table "tasks" add column "custom_fields" jsonb not null default '{}'::jsonb`,
    );
    this.addSql(`alter table "tasks" add column "points" integer null`);
    this.addSql(`alter table "tasks" add column "parent_id" uuid null`);
    this.addSql(
      `alter table "tasks" add column "dependencies" jsonb not null default '{"blocks": [], "blocked_by": []}'::jsonb`,
    );
    this.addSql(`alter table "tasks" add column "external_id" varchar(255) null`);
    this.addSql(
      `alter table "tasks" add constraint "tasks_parent_org_foreign" foreign key ("parent_id", "org_id") references "tasks" ("id", "org_id") on delete set null ("parent_id")`,
    );
    this.addSql(
      `do $$ begin if to_regclass('public.sprints') is not null then alter table "tasks" add constraint "tasks_sprint_id_foreign" foreign key ("sprint_id") references "sprints" ("id") on delete set null; end if; end $$`,
    );
    this.addSql(
      `create index "tasks_org_sprint_status" on "tasks" ("org_id", "sprint_id", "status")`,
    );
    this.addSql(
      `create index "tasks_org_parent" on "tasks" ("org_id", "parent_id")`,
    );
    this.addSql(
      `create index "tasks_custom_fields_gin" on "tasks" using gin ("custom_fields")`,
    );
    this.addSql(
      `create unique index "tasks_org_external_id" on "tasks" ("org_id", "external_id") where "external_id" is not null`,
    );

    this.addSql(
      `create table "task_statuses" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "project_id" uuid not null, "name" varchar(255) not null, "color" varchar(255) not null default '#6B7280', "category" varchar(255) not null, "position" integer not null default 0, "is_default" boolean not null default false, constraint "task_statuses_category_check" check ("category" in ('unstarted','started','completed','cancelled')), primary key ("id"))`,
    );
    this.addSql(
      `alter table "task_statuses" add constraint "task_statuses_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `create unique index "task_statuses_project_name_unique" on "task_statuses" ("project_id", "name")`,
    );
    this.addSql(
      `create index "task_statuses_org_project" on "task_statuses" ("org_id", "project_id")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "task_statuses" cascade`);
    this.addSql(`drop index if exists "tasks_org_external_id"`);
    this.addSql(`drop index if exists "tasks_custom_fields_gin"`);
    this.addSql(`drop index if exists "tasks_org_parent"`);
    this.addSql(`drop index if exists "tasks_org_sprint_status"`);
    this.addSql(
      `alter table "tasks" drop constraint if exists "tasks_sprint_id_foreign"`,
    );
    this.addSql(
      `alter table "tasks" drop constraint if exists "tasks_parent_org_foreign"`,
    );
    this.addSql(`alter table "tasks" drop column if exists "external_id"`);
    this.addSql(`alter table "tasks" drop column if exists "dependencies"`);
    this.addSql(`alter table "tasks" drop column if exists "parent_id"`);
    this.addSql(`alter table "tasks" drop column if exists "points"`);
    this.addSql(`alter table "tasks" drop column if exists "custom_fields"`);
    this.addSql(`alter table "tasks" drop column if exists "sprint_id"`);
    this.addSql(`alter table "tasks" drop column if exists "deleted_at"`);
    this.addSql(`alter table "tasks" drop column if exists "tiptap_content"`);
    this.addSql(`alter table "tasks" drop column if exists "description"`);
    this.addSql(`alter table "tasks" drop column if exists "title"`);
    this.addSql(`alter table "tasks" drop column if exists "updated_at"`);
  }
}
