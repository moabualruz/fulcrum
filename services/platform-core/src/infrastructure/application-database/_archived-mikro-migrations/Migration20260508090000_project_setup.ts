import { Migration } from "@mikro-orm/migrations";

export class Migration20260508090000_project_setup extends Migration {
  static readonly isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "projects" add column if not exists "parent_id" uuid null references "projects" ("id")`);
    this.addSql(`alter table "projects" add column if not exists "kind" text not null default 'project'`);
    this.addSql(`alter table "projects" add column if not exists "path" text null`);
    this.addSql(`alter table "projects" add column if not exists "depth" integer not null default 0`);
    this.addSql(`alter table "projects" add column if not exists "module_policy" jsonb not null default '{}'::jsonb`);
    this.addSql(`alter table "projects" add column if not exists "template_id" text null`);
    this.addSql(`alter table "projects" add column if not exists "workflow_id" text null`);
    this.addSql(`alter table "repos" add column if not exists "project_id" uuid null references "projects" ("id")`);
    this.addSql(`alter table "tasks" drop constraint if exists "tasks_task_type_check"`);
    this.addSql(`alter table "tasks" add constraint "tasks_task_type_check" check ("task_type" in ('initiative','epic','story','task','subtask','bug','chore'))`);
    this.addSql(`create index if not exists "projects_org_parent_idx" on "projects" ("org_id", "parent_id")`);
    this.addSql(`create index if not exists "projects_org_path_idx" on "projects" ("org_id", "path")`);
    this.addSql(`create index if not exists "repos_org_project_idx" on "repos" ("org_id", "project_id")`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "repos_org_project_idx"`);
    this.addSql(`drop index if exists "projects_org_path_idx"`);
    this.addSql(`drop index if exists "projects_org_parent_idx"`);
    this.addSql(`alter table "tasks" drop constraint if exists "tasks_task_type_check"`);
    this.addSql(`alter table "tasks" add constraint "tasks_task_type_check" check ("task_type" in ('epic','task','subtask','bug'))`);
    this.addSql(`alter table "projects" drop column if exists "workflow_id"`);
    this.addSql(`alter table "projects" drop column if exists "template_id"`);
    this.addSql(`alter table "projects" drop column if exists "module_policy"`);
    this.addSql(`alter table "projects" drop column if exists "depth"`);
    this.addSql(`alter table "projects" drop column if exists "path"`);
    this.addSql(`alter table "projects" drop column if exists "kind"`);
    this.addSql(`alter table "projects" drop column if exists "parent_id"`);
    this.addSql(`alter table "repos" drop column if exists "project_id"`);
  }
}
