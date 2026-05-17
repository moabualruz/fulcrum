import { Migration } from "@mikro-orm/migrations";

export class Migration20260502095400_custom_field_defs extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "custom_field_defs" (` +
        `"id" uuid not null default gen_random_uuid(), ` +
        `"org_id" uuid not null, ` +
        `"project_id" uuid not null, ` +
        `"name" varchar(255) not null, ` +
        `"slug" varchar(255) not null, ` +
        `"type" varchar(255) not null, ` +
        `"config_json" jsonb not null default '{}'::jsonb, ` +
        `"required" boolean not null default false, ` +
        `"archived" boolean not null default false, ` +
        `"position" integer not null default 0, ` +
        `constraint "custom_field_defs_type_check" check ("type" in ('text','select','multi_select','number','date','user','url','json')), ` +
        `constraint "custom_field_defs_project_slug_unique" unique ("project_id", "slug"), ` +
        `primary key ("id")` +
        `)`,
    );

    this.addSql(
      `do $$ begin ` +
        `if not exists (select 1 from pg_constraint where conname = 'custom_field_defs_org_id_foreign') then ` +
        `alter table "custom_field_defs" add constraint "custom_field_defs_org_id_foreign" ` +
        `foreign key ("org_id") references "orgs" ("id") on delete cascade; ` +
        `end if; end $$`,
    );

    this.addSql(
      `do $$ begin ` +
        `if to_regclass('public.projects') is not null ` +
        `and not exists (select 1 from pg_constraint where conname = 'custom_field_defs_project_id_foreign') then ` +
        `alter table "custom_field_defs" add constraint "custom_field_defs_project_id_foreign" ` +
        `foreign key ("project_id") references "projects" ("id") on delete cascade; ` +
        `end if; end $$`,
    );

    this.addSql(
      `create index if not exists "custom_field_defs_org_project" on "custom_field_defs" ("org_id", "project_id")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "custom_field_defs_org_project"`);
    this.addSql(`drop table if exists "custom_field_defs" cascade`);
  }
}
