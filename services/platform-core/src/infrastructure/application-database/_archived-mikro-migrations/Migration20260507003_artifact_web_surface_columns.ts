import { Migration } from "@mikro-orm/migrations";

export class Migration20260507003_artifact_web_surface_columns extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "artifacts" add column if not exists "project_id" uuid null`);
    this.addSql(`alter table "artifacts" add column if not exists "kind" varchar(255) not null default 'file'`);
    this.addSql(`alter table "artifacts" add column if not exists "title" varchar(255) not null default 'Untitled artifact'`);
    this.addSql(`alter table "artifacts" add column if not exists "body_path" text null`);
    this.addSql(`alter table "artifacts" add column if not exists "sha256" varchar(255) null`);
    this.addSql(`alter table "artifacts" add column if not exists "size" bigint null`);
    this.addSql(`alter table "artifacts" add column if not exists "archived" boolean not null default false`);
    this.addSql(`update "artifacts" set "title" = coalesce(nullif("title", ''), nullif("filename", ''), "id"::text)`);
    this.addSql(`update "artifacts" set "body_path" = coalesce("body_path", "path")`);
    this.addSql(`update "artifacts" set "sha256" = coalesce("sha256", "checksum_sha256")`);
    this.addSql(`update "artifacts" set "size" = coalesce("size", "size_bytes")`);
    this.addSql(`create index if not exists "artifacts_org_project_date" on "artifacts" ("org_id", "project_id", "created_at")`);
    this.addSql(`create index if not exists "artifacts_org_archived_date" on "artifacts" ("org_id", "archived", "created_at")`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "artifacts_org_archived_date"`);
    this.addSql(`drop index if exists "artifacts_org_project_date"`);
    this.addSql(`alter table "artifacts" drop column if exists "archived"`);
    this.addSql(`alter table "artifacts" drop column if exists "size"`);
    this.addSql(`alter table "artifacts" drop column if exists "sha256"`);
    this.addSql(`alter table "artifacts" drop column if exists "body_path"`);
    this.addSql(`alter table "artifacts" drop column if exists "title"`);
    this.addSql(`alter table "artifacts" drop column if exists "kind"`);
    this.addSql(`alter table "artifacts" drop column if exists "project_id"`);
  }
}
