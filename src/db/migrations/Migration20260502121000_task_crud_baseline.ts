/**
 * Migration: task CRUD baseline columns.
 *
 * Adds task content and soft-delete fields used by P6#07 repository + tRPC CRUD.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502121000_task_crud_baseline extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "tasks" add column if not exists "updated_at" timestamptz not null default now()`);
    this.addSql(`alter table "tasks" add column if not exists "title" varchar(255) not null default 'Untitled task'`);
    this.addSql(`alter table "tasks" add column if not exists "description" text null`);
    this.addSql(`alter table "tasks" add column if not exists "deleted_at" timestamptz null`);
    this.addSql(
      `create index "tasks_org_deleted_created" on "tasks" ("org_id", "deleted_at", "created_at" desc)`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "tasks_org_deleted_created"`);
    this.addSql(`alter table "tasks" drop column if exists "deleted_at"`);
    this.addSql(`alter table "tasks" drop column if exists "description"`);
    this.addSql(`alter table "tasks" drop column if exists "title"`);
    this.addSql(`alter table "tasks" drop column if exists "updated_at"`);
  }
}
