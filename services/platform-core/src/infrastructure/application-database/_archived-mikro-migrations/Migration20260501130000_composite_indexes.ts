/**
 * Composite-index stub tables migration — auto-generated from entity decorator diffs.
 *
 * Creates the 8 tenant-scoped stub tables WITH their composite (org_id, …) indexes
 * already in place. Later pillars (3, 6, 7, 8, 9, 10, 11, 12) will ALTER TABLE to
 * add domain-specific columns; the org FK + composite index never need to be
 * re-declared because they land in this baseline migration.
 *
 * Tables created (8):
 *   - tasks            (Pillar 6 stub)         idx_tasks_org_created          (org_id, created_at)
 *   - documents        (Pillar 7 stub)         idx_documents_org_updated      (org_id, updated_at)
 *   - memories         (Pillar 8 stub)         idx_memories_org_kind          (org_id, kind)
 *   - agent_runs       (Pillar 3 stub)         idx_agent_runs_org_started     (org_id, started_at)
 *   - artifacts        (Pillar 10 stub)        idx_artifacts_org_path         (org_id, path)
 *   - repos            (Pillar 9 stub)         idx_repos_org_slug             (org_id, slug)
 *   - jobs             (Pillar 12 stub)        idx_jobs_org_status_scheduled  (org_id, status, scheduled_for)
 *   - search_documents (Pillar 11 stub)        idx_search_documents_org_subject (org_id, entity_kind, entity_id)
 *
 * C2: composite indexes from day 1 — every tenant-scoped table queries by org first.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501130000_composite_indexes extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // ── tasks (Pillar 6 stub) ──────────────────────────────────────────────
    this.addSql(
      `create table "tasks" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_tasks_org_created" on "tasks" ("org_id", "created_at")`,
    );
    this.addSql(
      `create unique index "tasks_id_org_unique" on "tasks" ("id", "org_id")`,
    );
    this.addSql(
      `alter table "tasks" add constraint "tasks_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── documents (Pillar 7 stub) ──────────────────────────────────────────
    this.addSql(
      `create table "documents" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_documents_org_updated" on "documents" ("org_id", "updated_at")`,
    );
    this.addSql(
      `create unique index "documents_id_org_unique" on "documents" ("id", "org_id")`,
    );
    this.addSql(
      `alter table "documents" add constraint "documents_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── memories (Pillar 8 stub) ───────────────────────────────────────────
    this.addSql(
      `create table "memories" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "kind" varchar(255) not null, primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_memories_org_kind" on "memories" ("org_id", "kind")`,
    );
    this.addSql(
      `alter table "memories" add constraint "memories_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── agent_runs (Pillar 3 stub) ─────────────────────────────────────────
    this.addSql(
      `create table "agent_runs" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "started_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_agent_runs_org_started" on "agent_runs" ("org_id", "started_at")`,
    );
    this.addSql(
      `alter table "agent_runs" add constraint "agent_runs_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── artifacts (Pillar 10 stub) ─────────────────────────────────────────
    this.addSql(
      `create table "artifacts" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "path" varchar(255) not null, primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_artifacts_org_path" on "artifacts" ("org_id", "path")`,
    );
    this.addSql(
      `alter table "artifacts" add constraint "artifacts_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── repos (Pillar 9 stub) ──────────────────────────────────────────────
    this.addSql(
      `create table "repos" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "slug" varchar(255) not null, primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_repos_org_slug" on "repos" ("org_id", "slug")`,
    );
    this.addSql(
      `alter table "repos" add constraint "repos_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── jobs (Pillar 12 stub) ──────────────────────────────────────────────
    this.addSql(
      `create table "jobs" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "status" varchar(255) not null default 'pending', "scheduled_for" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_jobs_org_status_scheduled" on "jobs" ("org_id", "status", "scheduled_for")`,
    );
    this.addSql(
      `alter table "jobs" add constraint "jobs_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // ── search_documents (Pillar 11 stub) ──────────────────────────────────
    this.addSql(
      `create table "search_documents" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "entity_kind" varchar(255) not null, "entity_id" varchar(255) not null, primary key ("id"))`,
    );
    this.addSql(
      `create index "idx_search_documents_org_subject" on "search_documents" ("org_id", "entity_kind", "entity_id")`,
    );
    this.addSql(
      `alter table "search_documents" add constraint "search_documents_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "search_documents" cascade`);
    this.addSql(`drop table if exists "jobs" cascade`);
    this.addSql(`drop table if exists "repos" cascade`);
    this.addSql(`drop table if exists "artifacts" cascade`);
    this.addSql(`drop table if exists "agent_runs" cascade`);
    this.addSql(`drop table if exists "memories" cascade`);
    this.addSql(`drop table if exists "documents" cascade`);
    this.addSql(`drop table if exists "tasks" cascade`);
  }
}
