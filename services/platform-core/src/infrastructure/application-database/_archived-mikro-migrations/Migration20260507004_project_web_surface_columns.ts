import { Migration } from "@mikro-orm/migrations";

export class Migration20260507004_project_web_surface_columns extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "projects" add column if not exists "slug" text null`);
    this.addSql(`alter table "projects" add column if not exists "description" text null`);
    this.addSql(`update "projects" set "slug" = "id"::text where "slug" is null or "slug" = ''`);
    this.addSql(`create unique index if not exists "projects_org_slug" on "projects" ("org_id", "slug")`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "projects_org_slug"`);
    this.addSql(`alter table "projects" drop column if exists "description"`);
    this.addSql(`alter table "projects" drop column if exists "slug"`);
  }
}
