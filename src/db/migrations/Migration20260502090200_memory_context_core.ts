/**
 * Migration: Pillar 8 memory/context core schema.
 *
 * Adds always-on Memory columns, memory_links, context_snapshots, and Q22
 * org-scoped indexes. PGlite supports the emitted FTS GIN expression:
 * `to_tsvector('english', body)`, so no repository-side tsvector fallback is
 * required for this migration.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502090200_memory_context_core extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop index if exists "idx_memories_org_kind"`);

    this.addSql(`alter table "memories" add column "project_id" uuid null`);
    this.addSql(
      `alter table "memories" add column "global" boolean not null default false`,
    );
    this.addSql(`alter table "memories" alter column "kind" set default 'note'`);
    this.addSql(
      `alter table "memories" add column "body" text not null default ''`,
    );
    this.addSql(
      `alter table "memories" add column "tags" text[] not null default '{}'`,
    );
    this.addSql(
      `alter table "memories" add column "importance" varchar(255) not null default 'medium'`,
    );
    this.addSql(
      `alter table "memories" add column "source" varchar(255) not null default 'manual'`,
    );
    this.addSql(
      `alter table "memories" add column "source_ref" jsonb not null default '{}'::jsonb`,
    );
    this.addSql(
      `alter table "memories" add column "created_at" timestamptz not null default now()`,
    );
    this.addSql(
      `alter table "memories" add column "updated_at" timestamptz not null default now()`,
    );
    this.addSql(
      `alter table "memories" add column "archived" boolean not null default false`,
    );

    this.addSql(
      `alter table "memories" add constraint "memories_kind_check" check ("kind" in ('note', 'decision', 'blocker', 'file_ref', 'section_anchor', 'link', 'fact'))`,
    );
    this.addSql(
      `alter table "memories" add constraint "memories_importance_check" check ("importance" in ('low', 'medium', 'high'))`,
    );
    this.addSql(
      `alter table "memories" add constraint "memories_source_check" check ("source" in ('heuristic', 'llm', 'manual'))`,
    );

    this.addSql(
      `create index "memories_org_project_importance" on "memories" ("org_id", "project_id", "importance")`,
    );
    this.addSql(
      `create index "memories_org_kind" on "memories" ("org_id", "kind")`,
    );
    this.addSql(
      `create index "memories_org_archived" on "memories" ("org_id", "archived")`,
    );
    this.addSql(
      `create index "memories_org_global" on "memories" ("org_id", "global")`,
    );
    this.addSql(
      `create index "memories_body_tsv" on "memories" using gin (to_tsvector('english', body))`,
    );

    this.addSql(
      `create table "memory_links" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "memory_id" uuid not null, "target_kind" varchar(255) not null, "target_id" uuid not null, primary key ("id"))`,
    );
    this.addSql(
      `alter table "memory_links" add constraint "memory_links_target_kind_check" check ("target_kind" in ('task', 'doc', 'agent_run', 'artifact'))`,
    );
    this.addSql(
      `create index "memory_links_memory" on "memory_links" ("org_id", "memory_id")`,
    );
    this.addSql(
      `create index "memory_links_target" on "memory_links" ("org_id", "target_kind", "target_id")`,
    );
    this.addSql(
      `alter table "memory_links" add constraint "memory_links_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "memory_links" add constraint "memory_links_memory_id_foreign" foreign key ("memory_id") references "memories" ("id") on delete cascade`,
    );

    this.addSql(
      `create table "context_snapshots" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "run_id" uuid null, "task_id" uuid null, "bundle_blob" jsonb not null, "token_count" integer not null, "slice_sizes" jsonb not null, primary key ("id"))`,
    );
    this.addSql(
      `create index "context_snapshots_run" on "context_snapshots" ("org_id", "run_id")`,
    );
    this.addSql(
      `create index "context_snapshots_task" on "context_snapshots" ("org_id", "task_id")`,
    );
    this.addSql(
      `alter table "context_snapshots" add constraint "context_snapshots_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "context_snapshots" cascade`);
    this.addSql(`drop table if exists "memory_links" cascade`);

    this.addSql(`drop index if exists "memories_body_tsv"`);
    this.addSql(`drop index if exists "memories_org_global"`);
    this.addSql(`drop index if exists "memories_org_archived"`);
    this.addSql(`drop index if exists "memories_org_kind"`);
    this.addSql(`drop index if exists "memories_org_project_importance"`);
    this.addSql(
      `alter table "memories" drop constraint if exists "memories_source_check"`,
    );
    this.addSql(
      `alter table "memories" drop constraint if exists "memories_importance_check"`,
    );
    this.addSql(
      `alter table "memories" drop constraint if exists "memories_kind_check"`,
    );
    this.addSql(`alter table "memories" drop column if exists "archived"`);
    this.addSql(`alter table "memories" drop column if exists "updated_at"`);
    this.addSql(`alter table "memories" drop column if exists "created_at"`);
    this.addSql(`alter table "memories" drop column if exists "source_ref"`);
    this.addSql(`alter table "memories" drop column if exists "source"`);
    this.addSql(`alter table "memories" drop column if exists "importance"`);
    this.addSql(`alter table "memories" drop column if exists "tags"`);
    this.addSql(`alter table "memories" drop column if exists "body"`);
    this.addSql(`alter table "memories" alter column "kind" drop default`);
    this.addSql(`alter table "memories" drop column if exists "global"`);
    this.addSql(`alter table "memories" drop column if exists "project_id"`);
    this.addSql(
      `create index "idx_memories_org_kind" on "memories" ("org_id", "kind")`,
    );
  }
}
