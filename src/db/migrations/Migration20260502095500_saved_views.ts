/**
 * Migration: saved_views table — Pillar 6 T6-04.
 *
 * Creates `saved_views` with:
 *   - scope CHECK ('private'|'project'|'org')
 *   - view_type CHECK ('kanban'|'table'|'calendar'|'timeline'|'list'|'search')
 *   - Composite index saved_views_org_project (org_id, project_id)
 *   - Index saved_views_created_by (created_by)
 *   - FK org_id → orgs(id) ON DELETE CASCADE (unconditional)
 *   - FK created_by → users(id) (unconditional — users table always exists)
 *   - FK project_id → projects(id) ON DELETE CASCADE (conditional — projects
 *     table added by Pillar 1 / another migration; wired here when present)
 *
 * Closes: .scratch/agent-os-vision/06-tasks-and-scrum/issues/04-saved-views-schema.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502095500_saved_views extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "saved_views" (` +
        `"id" uuid not null default gen_random_uuid(), ` +
        `"org_id" uuid not null, ` +
        `"project_id" uuid null, ` +
        `"scope" varchar(255) not null default 'private', ` +
        `"name" varchar(255) not null, ` +
        `"query_json" jsonb not null default '{}'::jsonb, ` +
        `"order_by" jsonb not null default '[]'::jsonb, ` +
        `"view_type" varchar(255) not null default 'list', ` +
        `"created_by" uuid not null, ` +
        `"shared_with_users" text[] not null default '{}', ` +
        `"shared_with_teams" text[] not null default '{}', ` +
        `"default_for" varchar(255) null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `constraint "saved_views_scope_check" check (scope in ('private','project','org')), ` +
        `constraint "saved_views_view_type_check" check (view_type in ('kanban','table','calendar','timeline','list','search')), ` +
        `primary key ("id")` +
        `)`,
    );

    // FK: org_id → orgs(id)
    this.addSql(
      `do $$ begin ` +
        `if not exists (select 1 from pg_constraint where conname = 'saved_views_org_id_foreign') then ` +
        `alter table "saved_views" add constraint "saved_views_org_id_foreign" ` +
        `foreign key ("org_id") references "orgs" ("id") on delete cascade; ` +
        `end if; end $$`,
    );

    // FK: created_by → users(id) — users table always exists (auth migration runs first)
    this.addSql(
      `do $$ begin ` +
        `if not exists (select 1 from pg_constraint where conname = 'saved_views_created_by_foreign') then ` +
        `alter table "saved_views" add constraint "saved_views_created_by_foreign" ` +
        `foreign key ("created_by") references "users" ("id"); ` +
        `end if; end $$`,
    );

    // FK: project_id → projects(id) ON DELETE CASCADE — conditional; projects
    // table created by Pillar 1 / separate migration.
    this.addSql(
      `do $$ begin ` +
        `if to_regclass('public.projects') is not null ` +
        `and not exists (select 1 from pg_constraint where conname = 'saved_views_project_id_foreign') then ` +
        `alter table "saved_views" add constraint "saved_views_project_id_foreign" ` +
        `foreign key ("project_id") references "projects" ("id") on delete cascade; ` +
        `end if; end $$`,
    );

    this.addSql(
      `do $$ begin ` +
        `alter table "saved_views" drop constraint if exists "saved_views_view_type_check"; ` +
        `alter table "saved_views" add constraint "saved_views_view_type_check" ` +
        `check (view_type in ('kanban','table','calendar','timeline','list','search')); ` +
        `end $$`,
    );

    // Composite index: (org_id, project_id) for per-project view queries
    this.addSql(
      `create index if not exists "saved_views_org_project" on "saved_views" ("org_id", "project_id")`,
    );

    // Index: created_by for per-user view queries
    this.addSql(
      `create index if not exists "saved_views_created_by" on "saved_views" ("created_by")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "saved_views_created_by"`);
    this.addSql(`drop index if exists "saved_views_org_project"`);
    this.addSql(`drop table if exists "saved_views" cascade`);
  }
}
