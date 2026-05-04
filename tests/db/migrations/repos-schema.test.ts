/**
 * TDD — Pillar 9 repos + git supervision schema migration.
 *
 * Asserts that Migration20260502110000_repos_git:
 *  1. Extends `repos` table with all Pillar 9 columns.
 *  2. Creates repo_branches, repo_commits, repo_files_index tables.
 *  3. Installs all required composite, unique, and sort indexes.
 *  4. Adds tasks.repo_id nullable FK + tasks_org_repo index.
 *
 * RED phase: written before any implementation exists.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { MigrationObject } from "@mikro-orm/core";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "../../../src/db/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "../../../src/db/seed.ts";

import { Migration20260501104413_auth } from "../../../src/db/migrations/Migration20260501104413_auth.ts";
import { Migration20260501120537_events_org_id_backfill } from "../../../src/db/migrations/Migration20260501120537_events_org_id_backfill.ts";
import { Migration20260501120538_events_org_id_notnull } from "../../../src/db/migrations/Migration20260501120538_events_org_id_notnull.ts";
import { Migration20260501130000_composite_indexes } from "../../../src/db/migrations/Migration20260501130000_composite_indexes.ts";
import { Migration20260501130100_flag_stubs } from "../../../src/db/migrations/Migration20260501130100_flag_stubs.ts";
import { Migration20260501140000_schema_migration_ledger } from "../../../src/db/migrations/Migration20260501140000_schema_migration_ledger.ts";
import { Migration20260501150000_account_verification } from "../../../src/db/migrations/Migration20260501150000_account_verification.ts";
import { Migration20260502000001_orchestration_workflow_definitions } from "../../../src/db/migrations/Migration20260502000001_orchestration_workflow_definitions.ts";
import { Migration20260502011859_cross_cutting_platform } from "../../../src/db/migrations/Migration20260502011859_cross_cutting_platform.ts";
import { Migration20260502030300_agent_runs_symphony_columns } from "../../../src/db/migrations/Migration20260502030300_agent_runs_symphony_columns.ts";
import { Migration20260502050000_routing_rules } from "../../../src/db/migrations/Migration20260502050000_routing_rules.ts";
import { Migration20260502050200_skills_registry } from "../../../src/db/migrations/Migration20260502050200_skills_registry.ts";
import { Migration20260502070100_docs_document_columns } from "../../../src/db/migrations/Migration20260502070100_docs_document_columns.ts";
import { Migration20260502070200_docs_related_tables } from "../../../src/db/migrations/Migration20260502070200_docs_related_tables.ts";
import { Migration20260502070400_agent_runs_sandcastle_columns } from "../../../src/db/migrations/Migration20260502070400_agent_runs_sandcastle_columns.ts";
import { Migration20260502070500_artifacts_edges } from "../../../src/db/migrations/Migration20260502070500_artifacts_edges.ts";
import { Migration20260502080000_inference_cache_schema } from "../../../src/db/migrations/Migration20260502080000_inference_cache_schema.ts";
import { Migration20260502090000_tasks_schema_extension } from "../../../src/db/migrations/Migration20260502090000_tasks_schema_extension.ts";
import { Migration20260502090100_agent_runs_claimed_by } from "../../../src/db/migrations/Migration20260502090100_agent_runs_claimed_by.ts";
import { Migration20260502090200_memory_context_core } from "../../../src/db/migrations/Migration20260502090200_memory_context_core.ts";
import { Migration20260502090300_sprints_schema } from "../../../src/db/migrations/Migration20260502090300_sprints_schema.ts";
import { Migration20260502095500_saved_views } from "../../../src/db/migrations/Migration20260502095500_saved_views.ts";
import { Migration20260502100000_memory_heuristic_dedup_constraints } from "../../../src/db/migrations/Migration20260502100000_memory_heuristic_dedup_constraints.ts";
import { Migration20260502110000_repos_git } from "../../../src/db/migrations/Migration20260502110000_repos_git.ts";

// ── constants ──────────────────────────────────────────────────────────────

const REPOS_COLUMNS = [
  "name",
  "slug",
  "kind",
  "local_path",
  "remote_url",
  "default_branch",
  "current_branch",
  "last_sync_at",
  "sync_status",
  "last_touched_at",
  "archived",
] as const;

const REPOS_INDEXES = [
  "repos_org_slug",
  "repos_org_touched",
  "repos_kind_status",
] as const;

const BRANCH_INDEXES = [
  "repo_branches_repo_name_unique",
  "repo_branches_org_repo",
] as const;

const COMMIT_INDEXES = [
  "repo_commits_repo_sha_unique",
  "repo_commits_repo_committed_at",
  "repo_commits_org_repo",
] as const;

const FILES_INDEXES = [
  "repo_files_repo_path_unique",
  "repo_files_org_repo_kind",
] as const;

const TASKS_REPO_INDEX = "tasks_org_repo";

// ── helpers ────────────────────────────────────────────────────────────────

interface Db {
  orm: MikroORM;
  close: () => Promise<void>;
}

function migrationsList(): MigrationObject[] {
  return [
    { name: "Migration20260501104413_auth", class: Migration20260501104413_auth },
    { name: "Migration20260501120537_events_org_id_backfill", class: Migration20260501120537_events_org_id_backfill },
    { name: "Migration20260501120538_events_org_id_notnull", class: Migration20260501120538_events_org_id_notnull },
    { name: "Migration20260501130000_composite_indexes", class: Migration20260501130000_composite_indexes },
    { name: "Migration20260501130100_flag_stubs", class: Migration20260501130100_flag_stubs },
    { name: "Migration20260501140000_schema_migration_ledger", class: Migration20260501140000_schema_migration_ledger },
    { name: "Migration20260501150000_account_verification", class: Migration20260501150000_account_verification },
    { name: "Migration20260502000001_orchestration_workflow_definitions", class: Migration20260502000001_orchestration_workflow_definitions },
    { name: "Migration20260502011859_cross_cutting_platform", class: Migration20260502011859_cross_cutting_platform },
    { name: "Migration20260502030300_agent_runs_symphony_columns", class: Migration20260502030300_agent_runs_symphony_columns },
    { name: "Migration20260502050000_routing_rules", class: Migration20260502050000_routing_rules },
    { name: "Migration20260502050200_skills_registry", class: Migration20260502050200_skills_registry },
    { name: "Migration20260502070100_docs_document_columns", class: Migration20260502070100_docs_document_columns },
    { name: "Migration20260502070200_docs_related_tables", class: Migration20260502070200_docs_related_tables },
    { name: "Migration20260502070400_agent_runs_sandcastle_columns", class: Migration20260502070400_agent_runs_sandcastle_columns },
    { name: "Migration20260502070500_artifacts_edges", class: Migration20260502070500_artifacts_edges },
    { name: "Migration20260502080000_inference_cache_schema", class: Migration20260502080000_inference_cache_schema },
    { name: "Migration20260502090000_tasks_schema_extension", class: Migration20260502090000_tasks_schema_extension },
    { name: "Migration20260502090100_agent_runs_claimed_by", class: Migration20260502090100_agent_runs_claimed_by },
    { name: "Migration20260502090200_memory_context_core", class: Migration20260502090200_memory_context_core },
    { name: "Migration20260502090300_sprints_schema", class: Migration20260502090300_sprints_schema },
    { name: "Migration20260502095500_saved_views", class: Migration20260502095500_saved_views },
    { name: "Migration20260502100000_memory_heuristic_dedup_constraints", class: Migration20260502100000_memory_heuristic_dedup_constraints },
    { name: "Migration20260502110000_repos_git", class: Migration20260502110000_repos_git },
  ];
}

async function buildDb(): Promise<Db> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });
  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
    migrationsList: migrationsList(),
  };
  config.extensions = [Migrator];
  const orm = await MikroORMRuntime.init(config);
  return {
    orm,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

async function rows<T extends object>(
  orm: MikroORM,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await orm.em.getConnection().execute(sql, params)) as T[];
}

function quoteList(values: readonly string[]): string {
  return values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", ");
}

// ── test suite ─────────────────────────────────────────────────────────────

describe("Repos git supervision schema migration", () => {
  let db: Db | undefined;

  beforeAll(async () => {
    db = await buildDb();
    await db.orm.migrator.up();
    await new SeedService(db.orm.em).run();
  });

  afterAll(async () => {
    await db?.close();
  });

  it("migration applies without error (migrator reports 0 pending after up)", async () => {
    const pending = await db!.orm.migrator.getPending();
    expect(pending).toHaveLength(0);
  });

  it("repos table has all Pillar 9 additive columns", async () => {
    const result = await rows<{ column_name: string }>(
      db!.orm,
      `select column_name from information_schema.columns
       where table_name = 'repos'
         and column_name in (${quoteList(REPOS_COLUMNS)})`,
    );
    expect(result.map((r) => r.column_name).sort()).toEqual([...REPOS_COLUMNS].sort());
  });

  it("repos has unique index repos_org_slug (org_id, slug)", async () => {
    const result = await rows<{ indexname: string; indexdef: string }>(
      db!.orm,
      `select indexname, indexdef from pg_indexes
       where tablename = 'repos' and indexname = 'repos_org_slug'`,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.indexdef).toContain("org_id");
    expect(result[0]!.indexdef).toContain("slug");
  });

  it("repos has index repos_org_touched (org_id, last_touched_at DESC)", async () => {
    const result = await rows<{ indexname: string; indexdef: string }>(
      db!.orm,
      `select indexname, indexdef from pg_indexes
       where tablename = 'repos' and indexname = 'repos_org_touched'`,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.indexdef.toLowerCase()).toContain("last_touched_at");
  });

  it("repos has index repos_kind_status (kind, sync_status)", async () => {
    const result = await rows<{ indexname: string }>(
      db!.orm,
      `select indexname from pg_indexes
       where tablename = 'repos' and indexname = 'repos_kind_status'`,
    );
    expect(result).toHaveLength(1);
  });

  it("repo_branches table exists with UNIQUE (repo_id, name) and (org_id, repo_id) indexes", async () => {
    const tables = await rows<{ table_name: string }>(
      db!.orm,
      `select table_name from information_schema.tables where table_name = 'repo_branches'`,
    );
    expect(tables).toHaveLength(1);

    const indexes = await rows<{ indexname: string }>(
      db!.orm,
      `select indexname from pg_indexes
       where tablename = 'repo_branches'
         and indexname in (${quoteList(BRANCH_INDEXES)})`,
    );
    expect(indexes.map((r) => r.indexname).sort()).toEqual([...BRANCH_INDEXES].sort());
  });

  it("repo_commits table exists with UNIQUE (repo_id, sha), (repo_id, committed_at DESC), and (org_id, repo_id) indexes", async () => {
    const tables = await rows<{ table_name: string }>(
      db!.orm,
      `select table_name from information_schema.tables where table_name = 'repo_commits'`,
    );
    expect(tables).toHaveLength(1);

    const indexes = await rows<{ indexname: string }>(
      db!.orm,
      `select indexname from pg_indexes
       where tablename = 'repo_commits'
         and indexname in (${quoteList(COMMIT_INDEXES)})`,
    );
    expect(indexes.map((r) => r.indexname).sort()).toEqual([...COMMIT_INDEXES].sort());
  });

  it("repo_files_index table exists with UNIQUE (repo_id, path) and (org_id, repo_id, kind) indexes", async () => {
    const tables = await rows<{ table_name: string }>(
      db!.orm,
      `select table_name from information_schema.tables where table_name = 'repo_files_index'`,
    );
    expect(tables).toHaveLength(1);

    const indexes = await rows<{ indexname: string }>(
      db!.orm,
      `select indexname from pg_indexes
       where tablename = 'repo_files_index'
         and indexname in (${quoteList(FILES_INDEXES)})`,
    );
    expect(indexes.map((r) => r.indexname).sort()).toEqual([...FILES_INDEXES].sort());
  });

  it("tasks table has repo_id nullable column", async () => {
    const result = await rows<{ column_name: string; is_nullable: string }>(
      db!.orm,
      `select column_name, is_nullable from information_schema.columns
       where table_name = 'tasks' and column_name = 'repo_id'`,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.is_nullable).toBe("YES");
  });

  it("tasks has tasks_org_repo index", async () => {
    const result = await rows<{ indexname: string }>(
      db!.orm,
      `select indexname from pg_indexes
       where tablename = 'tasks' and indexname = '${TASKS_REPO_INDEX}'`,
    );
    expect(result).toHaveLength(1);
  });

  it("re-run is no-op (0 pending after second up)", async () => {
    const second = await db!.orm.migrator.up();
    expect(second).toHaveLength(0);
  });
});
