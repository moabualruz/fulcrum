/**
 * Migration: DDL cleanup — relocate inline ALTER TABLE from request handlers.
 *
 * Moves schema changes previously executed at runtime in:
 *   - apps/web/src/lib/server/tasks.ts (due_date, start_date columns)
 *   - apps/web/src/lib/server/documents.ts (doc_links columns + defaults)
 *
 * All statements use IF NOT EXISTS / idempotent forms so this migration is
 * safe to run on databases that already have the columns from runtime DDL.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260504130000_ddl_cleanup extends Migration {
  static readonly isLossy = true;

  override async up(): Promise<void> {
    // tasks: date columns previously added inline in updateTaskAction
    this.addSql(`alter table "tasks" add column if not exists "due_date" date`);
    this.addSql(`alter table "tasks" add column if not exists "start_date" date`);

    // doc_links: columns + defaults previously added in ensureDocLinksCompatibility
    this.addSql(`alter table "doc_links" add column if not exists "from_doc_id" text references "documents"("id")`);
    this.addSql(`alter table "doc_links" add column if not exists "to_doc_id" text references "documents"("id")`);
    this.addSql(`alter table "doc_links" add column if not exists "to_slug" text`);
    this.addSql(`alter table "doc_links" add column if not exists "link_kind" text not null default 'wikilink'`);
    this.addSql(`alter table "doc_links" alter column "id" set default gen_random_uuid()`);
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from information_schema.columns
          where table_name = 'doc_links' and column_name = 'source_doc_id'
        ) then
          alter table "doc_links" alter column "source_doc_id" drop not null;
        end if;
        if exists (
          select 1 from information_schema.columns
          where table_name = 'doc_links' and column_name = 'target_doc_id'
        ) then
          alter table "doc_links" alter column "target_doc_id" drop not null;
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    // Reverse: drop the added columns (alter column changes are not trivially reversible)
    this.addSql(`alter table "tasks" drop column if exists "due_date"`);
    this.addSql(`alter table "tasks" drop column if exists "start_date"`);
    this.addSql(`alter table "doc_links" drop column if exists "from_doc_id"`);
    this.addSql(`alter table "doc_links" drop column if exists "to_doc_id"`);
    this.addSql(`alter table "doc_links" drop column if exists "to_slug"`);
    this.addSql(`alter table "doc_links" drop column if exists "link_kind"`);
    // Restore legacy NOT NULL constraints only on schemas that still have those columns.
    this.addSql(`
      do $$
      begin
        if exists (
          select 1 from information_schema.columns
          where table_name = 'doc_links' and column_name = 'source_doc_id'
        ) then
          alter table "doc_links" alter column "source_doc_id" set not null;
        end if;
        if exists (
          select 1 from information_schema.columns
          where table_name = 'doc_links' and column_name = 'target_doc_id'
        ) then
          alter table "doc_links" alter column "target_doc_id" set not null;
        end if;
      end $$;
    `);
  }
}
