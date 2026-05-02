/**
 * Migration: Pillar 7 docs related tables.
 *
 * Creates doc_links, doc_versions, doc_comments, and doc_templates with
 * org-scoped composite indexes per Q22.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502070200_docs_related_tables extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table "doc_links" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "from_doc_id" uuid not null, "to_doc_id" uuid null, "to_slug" varchar(255) not null, "link_kind" varchar(255) not null default 'wikilink', "anchor" varchar(255) null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "doc_links" add constraint "doc_links_link_kind_check" check ("link_kind" in ('wikilink', 'task_ref', 'run_ref', 'mention'))`,
    );
    this.addSql(
      `create index "doc_links_org_from" on "doc_links" ("org_id", "from_doc_id")`,
    );
    this.addSql(
      `create index "doc_links_org_to" on "doc_links" ("org_id", "to_doc_id")`,
    );
    this.addSql(
      `alter table "doc_links" add constraint "doc_links_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "doc_links" add constraint "doc_links_from_doc_org_foreign" foreign key ("from_doc_id", "org_id") references "documents" ("id", "org_id") on delete cascade`,
    );
    this.addSql(
      `alter table "doc_links" add constraint "doc_links_to_doc_org_foreign" foreign key ("to_doc_id", "org_id") references "documents" ("id", "org_id") on delete set null ("to_doc_id")`,
    );

    this.addSql(
      `create table "doc_versions" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "doc_id" uuid not null, "version_num" int not null, "snapshot" jsonb null, "delta" jsonb null, "body_md_snapshot" text null, "author_id" uuid null, "restore_of" uuid null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create unique index "doc_versions_id_org_unique" on "doc_versions" ("id", "org_id")`,
    );
    this.addSql(
      `create unique index "doc_versions_doc_version_unique" on "doc_versions" ("doc_id", "version_num")`,
    );
    this.addSql(
      `create index "doc_versions_org_doc_version" on "doc_versions" ("org_id", "doc_id", "version_num")`,
    );
    this.addSql(
      `create index "doc_versions_author" on "doc_versions" ("author_id")`,
    );
    this.addSql(
      `alter table "doc_versions" add constraint "doc_versions_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "doc_versions" add constraint "doc_versions_doc_org_foreign" foreign key ("doc_id", "org_id") references "documents" ("id", "org_id") on delete cascade`,
    );
    this.addSql(
      `alter table "doc_versions" add constraint "doc_versions_author_org_foreign" foreign key ("author_id", "org_id") references "users" ("id", "org_id") on delete set null ("author_id")`,
    );
    this.addSql(
      `alter table "doc_versions" add constraint "doc_versions_restore_org_foreign" foreign key ("restore_of", "org_id") references "doc_versions" ("id", "org_id") on delete set null ("restore_of")`,
    );

    this.addSql(
      `create table "doc_comments" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "doc_id" uuid not null, "anchor_range" jsonb null, "author_id" uuid null, "body_md" text not null, "parent_comment_id" uuid null, "resolved" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create unique index "doc_comments_id_org_unique" on "doc_comments" ("id", "org_id")`,
    );
    this.addSql(
      `create index "doc_comments_org_doc" on "doc_comments" ("org_id", "doc_id")`,
    );
    this.addSql(
      `create index "doc_comments_author" on "doc_comments" ("author_id")`,
    );
    this.addSql(
      `alter table "doc_comments" add constraint "doc_comments_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "doc_comments" add constraint "doc_comments_doc_org_foreign" foreign key ("doc_id", "org_id") references "documents" ("id", "org_id") on delete cascade`,
    );
    this.addSql(
      `alter table "doc_comments" add constraint "doc_comments_author_org_foreign" foreign key ("author_id", "org_id") references "users" ("id", "org_id") on delete set null ("author_id")`,
    );
    this.addSql(
      `alter table "doc_comments" add constraint "doc_comments_parent_org_foreign" foreign key ("parent_comment_id", "org_id") references "doc_comments" ("id", "org_id") on delete cascade`,
    );

    this.addSql(
      `create table "doc_templates" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "project_id" uuid null, "doc_type" varchar(255) not null, "name" varchar(255) not null, "frontmatter_template" jsonb not null default '{}'::jsonb, "body_template" text not null default '', "is_default" boolean not null default false, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "doc_templates" add constraint "doc_templates_doc_type_check" check ("doc_type" in ('spec', 'adr', 'wiki', 'runbook', 'meeting', 'postmortem', 'rfc', 'note', 'scratch'))`,
    );
    this.addSql(
      `create unique index "doc_templates_org_project_type_name_unique" on "doc_templates" ("org_id", "project_id", "doc_type", "name")`,
    );
    this.addSql(
      `create unique index "doc_templates_org_global_type_name_unique" on "doc_templates" ("org_id", "doc_type", "name") where "project_id" is null`,
    );
    this.addSql(
      `create index "doc_templates_org_project_type" on "doc_templates" ("org_id", "project_id", "doc_type")`,
    );
    this.addSql(
      `alter table "doc_templates" add constraint "doc_templates_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "doc_templates" cascade`);
    this.addSql(`drop table if exists "doc_comments" cascade`);
    this.addSql(`drop table if exists "doc_versions" cascade`);
    this.addSql(`drop table if exists "doc_links" cascade`);
  }
}
