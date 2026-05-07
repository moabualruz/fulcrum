import { Migration } from "@mikro-orm/migrations";

export class Migration20260507002_jobs_dispatch_project_scope extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "events" add column if not exists "actor" varchar(255) null`);

    this.addSql(`alter table "jobs" add column if not exists "project_id" uuid null`);
    this.addSql(`alter table "jobs" add column if not exists "queue" varchar(255) not null default 'default'`);
    this.addSql(`alter table "jobs" add column if not exists "kind" varchar(255) not null default 'generic'`);
    this.addSql(`alter table "jobs" add column if not exists "payload" jsonb not null default '{}'::jsonb`);
    this.addSql(`alter table "jobs" add column if not exists "max_attempts" integer not null default 3`);
    this.addSql(`alter table "jobs" add column if not exists "available_at" timestamptz not null default now()`);

    this.addSql(`
      create index if not exists "idx_jobs_org_project_queue_status_available"
        on "jobs" ("org_id", "project_id", "queue", "status", "available_at")
    `);

    this.addSql(`
      do $$ begin
        if to_regclass('public.projects') is not null and not exists (
          select 1 from pg_constraint where conname = 'jobs_project_id_foreign'
        ) then
          alter table "jobs"
            add constraint "jobs_project_id_foreign"
            foreign key ("project_id") references "projects" ("id") on delete set null;
        end if;
      end $$
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "jobs" drop constraint if exists "jobs_project_id_foreign"`);
    this.addSql(`drop index if exists "idx_jobs_org_project_queue_status_available"`);
    this.addSql(`alter table "jobs" drop column if exists "available_at"`);
    this.addSql(`alter table "jobs" drop column if exists "max_attempts"`);
    this.addSql(`alter table "jobs" drop column if exists "payload"`);
    this.addSql(`alter table "jobs" drop column if exists "kind"`);
    this.addSql(`alter table "jobs" drop column if exists "queue"`);
    this.addSql(`alter table "jobs" drop column if exists "project_id"`);
    this.addSql(`alter table "events" drop column if exists "actor"`);
  }
}
