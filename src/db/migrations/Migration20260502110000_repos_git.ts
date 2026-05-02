/**
 * Migration: Pillar 9 repos + git supervision schema.
 *
 * 1. Extends `repos` with Pillar 9 supervision columns:
 *    name, kind, local_path, remote_url, default_branch, current_branch,
 *    last_sync_at, sync_status, last_touched_at, archived.
 * 2. Adds unique index repos_org_slug (org_id, slug) + sort indexes.
 * 3. Creates repo_branches, repo_commits, repo_files_index tables.
 * 4. Adds tasks.repo_id nullable FK + tasks_org_repo index.
 *
 * C2: all composite / unique indexes created at table-creation time.
 * Closes (issue): .scratch/agent-os-vision/09-repos-git-supervision/issues/01-schema-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502110000_repos_git extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // ── extend repos ──────────────────────────────────────────────────────
    this.addSql(`alter table "repos" add column if not exists "name" varchar(255) not null default ''`);
    this.addSql(`alter table "repos" add column if not exists "kind" varchar(10) not null default 'local' check ("kind" in ('local', 'remote'))`);
    this.addSql(`alter table "repos" add column if not exists "local_path" text null`);
    this.addSql(`alter table "repos" add column if not exists "remote_url" text null`);
    this.addSql(`alter table "repos" add column if not exists "default_branch" varchar(255) null`);
    this.addSql(`alter table "repos" add column if not exists "current_branch" varchar(255) null`);
    this.addSql(`alter table "repos" add column if not exists "last_sync_at" timestamptz null`);
    this.addSql(`alter table "repos" add column if not exists "sync_status" varchar(10) not null default 'idle' check ("sync_status" in ('idle', 'syncing', 'error'))`);
    this.addSql(`alter table "repos" add column if not exists "last_touched_at" timestamptz null`);
    this.addSql(`alter table "repos" add column if not exists "archived" boolean not null default false`);

    // unique + sort indexes on repos
    this.addSql(`create unique index if not exists "repos_org_slug" on "repos" ("org_id", "slug")`);
    this.addSql(`create index if not exists "repos_org_touched" on "repos" ("org_id", "last_touched_at" desc)`);
    this.addSql(`create index if not exists "repos_kind_status" on "repos" ("kind", "sync_status")`);

    // ── repo_branches ─────────────────────────────────────────────────────
    this.addSql(
      `create table if not exists "repo_branches" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "repo_id" uuid not null,
        "name" varchar(255) not null,
        "sha" varchar(255) null,
        "is_default" boolean not null default false,
        primary key ("id")
      )`,
    );
    this.addSql(
      `alter table "repo_branches"
       add constraint "repo_branches_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "repo_branches"
       add constraint "repo_branches_repo_id_foreign" foreign key ("repo_id") references "repos" ("id") on delete cascade`,
    );
    this.addSql(`create unique index "repo_branches_repo_name_unique" on "repo_branches" ("repo_id", "name")`);
    this.addSql(`create index "repo_branches_org_repo" on "repo_branches" ("org_id", "repo_id")`);

    // ── repo_commits ──────────────────────────────────────────────────────
    this.addSql(
      `create table if not exists "repo_commits" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "repo_id" uuid not null,
        "sha" varchar(255) not null,
        "message" text null,
        "author" varchar(255) null,
        "committed_at" timestamptz null,
        primary key ("id")
      )`,
    );
    this.addSql(
      `alter table "repo_commits"
       add constraint "repo_commits_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "repo_commits"
       add constraint "repo_commits_repo_id_foreign" foreign key ("repo_id") references "repos" ("id") on delete cascade`,
    );
    this.addSql(`create unique index "repo_commits_repo_sha_unique" on "repo_commits" ("repo_id", "sha")`);
    this.addSql(`create index "repo_commits_repo_committed_at" on "repo_commits" ("repo_id", "committed_at" desc)`);
    this.addSql(`create index "repo_commits_org_repo" on "repo_commits" ("org_id", "repo_id")`);

    // ── repo_files_index ──────────────────────────────────────────────────
    this.addSql(
      `create table if not exists "repo_files_index" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "repo_id" uuid not null,
        "path" text not null,
        "kind" varchar(20) not null,
        "size" bigint null,
        primary key ("id")
      )`,
    );
    this.addSql(
      `alter table "repo_files_index"
       add constraint "repo_files_index_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "repo_files_index"
       add constraint "repo_files_index_repo_id_foreign" foreign key ("repo_id") references "repos" ("id") on delete cascade`,
    );
    this.addSql(`create unique index "repo_files_repo_path_unique" on "repo_files_index" ("repo_id", "path")`);
    this.addSql(`create index "repo_files_org_repo_kind" on "repo_files_index" ("org_id", "repo_id", "kind")`);

    // ── tasks.repo_id ─────────────────────────────────────────────────────
    this.addSql(`alter table "tasks" add column if not exists "repo_id" uuid null`);
    this.addSql(
      `alter table "tasks"
       add constraint "tasks_repo_id_foreign" foreign key ("repo_id") references "repos" ("id") on delete set null`,
    );
    this.addSql(
      `create index "tasks_org_repo" on "tasks" ("org_id", "repo_id") where "repo_id" is not null`,
    );
  }

  override async down(): Promise<void> {
    // tasks
    this.addSql(`drop index if exists "tasks_org_repo"`);
    this.addSql(`alter table "tasks" drop constraint if exists "tasks_repo_id_foreign"`);
    this.addSql(`alter table "tasks" drop column if exists "repo_id"`);

    // repo_files_index
    this.addSql(`drop table if exists "repo_files_index" cascade`);

    // repo_commits
    this.addSql(`drop table if exists "repo_commits" cascade`);

    // repo_branches
    this.addSql(`drop table if exists "repo_branches" cascade`);

    // repos extended columns + indexes
    this.addSql(`drop index if exists "repos_kind_status"`);
    this.addSql(`drop index if exists "repos_org_touched"`);
    this.addSql(`drop index if exists "repos_org_slug"`);
    this.addSql(`alter table "repos" drop column if exists "archived"`);
    this.addSql(`alter table "repos" drop column if exists "last_touched_at"`);
    this.addSql(`alter table "repos" drop column if exists "sync_status"`);
    this.addSql(`alter table "repos" drop column if exists "last_sync_at"`);
    this.addSql(`alter table "repos" drop column if exists "current_branch"`);
    this.addSql(`alter table "repos" drop column if exists "default_branch"`);
    this.addSql(`alter table "repos" drop column if exists "remote_url"`);
    this.addSql(`alter table "repos" drop column if exists "local_path"`);
    this.addSql(`alter table "repos" drop column if exists "kind"`);
    this.addSql(`alter table "repos" drop column if exists "name"`);
  }
}
