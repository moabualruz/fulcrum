import { Migration } from "@mikro-orm/migrations";

export class Migration20260507001 extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "artifact_retention_policies" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "project_id" uuid null,
        "scope_kind" varchar(32) not null default 'project',
        "artifact_kind" varchar(64) not null,
        "retention_days" integer null,
        "keep_latest_per_ref" boolean not null default true,
        "keep_pinned" boolean not null default true,
        "enabled" boolean not null default true,
        "notes" text null,
        "created_by" uuid null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);

    this.addSql(`
      create index if not exists "idx_artifact_retention_policies_org"
        on "artifact_retention_policies" ("org_id")
    `);
    this.addSql(`
      create index if not exists "idx_artifact_retention_policies_artifact_kind"
        on "artifact_retention_policies" ("artifact_kind")
    `);
    this.addSql(`
      create unique index if not exists "uq_artifact_retention_policies_scope"
        on "artifact_retention_policies" ("org_id", "project_id", "scope_kind", "artifact_kind") nulls not distinct
    `);

    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'artifact_retention_policies_org_id_foreign'
        ) then
          alter table "artifact_retention_policies"
            add constraint "artifact_retention_policies_org_id_foreign"
            foreign key ("org_id") references "orgs" ("id") on delete cascade;
        end if;
      end $$
    `);

    this.addSql(`
      do $$ begin
        if not exists (
          select 1 from pg_constraint where conname = 'artifact_retention_policies_project_id_foreign'
        ) then
          alter table "artifact_retention_policies"
            add constraint "artifact_retention_policies_project_id_foreign"
            foreign key ("project_id") references "projects" ("id") on delete cascade;
        end if;
      end $$
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "artifact_retention_policies" cascade`);
  }
}
