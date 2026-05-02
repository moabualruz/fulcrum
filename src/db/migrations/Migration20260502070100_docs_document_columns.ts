/**
 * Migration: Pillar 7 Document additive columns + docs_org_* indexes.
 *
 * C6: addSql(...) strings are sanctioned inside MikroORM migration classes.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502070100_docs_document_columns extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "documents" add column "parent_id" uuid null`);
    this.addSql(`alter table "documents" add column "project_id" uuid null`);
    this.addSql(
      `alter table "documents" add column "scope" varchar(255) not null default 'project'`,
    );
    this.addSql(
      `alter table "documents" add column "doc_type" varchar(255) not null default 'note'`,
    );
    this.addSql(
      `alter table "documents" add column "frontmatter" jsonb not null default '{}'::jsonb`,
    );
    this.addSql(
      `alter table "documents" add column "body_md" text not null default ''`,
    );
    this.addSql(
      `alter table "documents" add column "content_json" jsonb not null default '{}'::jsonb`,
    );
    this.addSql(
      `alter table "documents" add column "sort_position" float8 not null default 0`,
    );
    this.addSql(
      `alter table "documents" add column "archived" boolean not null default false`,
    );
    this.addSql(`alter table "documents" add column "external_id" varchar(255) null`);

    this.addSql(
      `alter table "documents" add constraint "documents_parent_org_foreign" foreign key ("parent_id", "org_id") references "documents" ("id", "org_id") on delete set null ("parent_id")`,
    );
    this.addSql(
      `alter table "documents" add constraint "documents_scope_check" check ("scope" in ('project', 'global'))`,
    );
    this.addSql(
      `alter table "documents" add constraint "documents_doc_type_check" check ("doc_type" in ('spec', 'adr', 'wiki', 'runbook', 'meeting', 'postmortem', 'rfc', 'note', 'scratch'))`,
    );

    this.addSql(
      `create index "docs_org_project_scope" on "documents" ("org_id", "project_id", "scope")`,
    );
    this.addSql(
      `create index "docs_org_doc_type" on "documents" ("org_id", "doc_type")`,
    );
    this.addSql(
      `create index "docs_org_parent" on "documents" ("org_id", "parent_id")`,
    );
    this.addSql(
      `create unique index "docs_org_external_id" on "documents" ("org_id", "external_id") where "external_id" is not null`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "docs_org_external_id"`);
    this.addSql(`drop index if exists "docs_org_parent"`);
    this.addSql(`drop index if exists "docs_org_doc_type"`);
    this.addSql(`drop index if exists "docs_org_project_scope"`);
    this.addSql(
      `alter table "documents" drop constraint if exists "documents_doc_type_check"`,
    );
    this.addSql(
      `alter table "documents" drop constraint if exists "documents_scope_check"`,
    );
    this.addSql(
      `alter table "documents" drop constraint if exists "documents_parent_org_foreign"`,
    );
    this.addSql(`alter table "documents" drop column if exists "external_id"`);
    this.addSql(`alter table "documents" drop column if exists "archived"`);
    this.addSql(`alter table "documents" drop column if exists "sort_position"`);
    this.addSql(`alter table "documents" drop column if exists "content_json"`);
    this.addSql(`alter table "documents" drop column if exists "body_md"`);
    this.addSql(`alter table "documents" drop column if exists "frontmatter"`);
    this.addSql(`alter table "documents" drop column if exists "doc_type"`);
    this.addSql(`alter table "documents" drop column if exists "scope"`);
    this.addSql(`alter table "documents" drop column if exists "project_id"`);
    this.addSql(`alter table "documents" drop column if exists "parent_id"`);
  }
}
