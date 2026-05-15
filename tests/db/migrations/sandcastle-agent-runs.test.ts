/**
 * TDD — AgentRun Sandcastle payload columns + search document FK.
 *
 * RED target: AgentRun lacks Sandcastle run metadata and the migration adding
 * those columns. GREEN target: migration applies, CHECK/index/FK exist, and
 * repository round-trip exposes the seven Sandcastle properties.
 *
 * Closes (issue): .scratch/agent-os-vision/04-sandcastle-wrapper/issues/02-agent-runs-schema-migration.md
 */

import { afterAll, describe, expect, it } from "bun:test";
import type { MigrationObject } from "@mikro-orm/core";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { AgentRun } from "@platform-core/infrastructure/application-database/entities/orchestration/AgentRun.ts";
import { SearchDocument } from "@platform-core/infrastructure/application-database/entities/search/SearchDocument.ts";
import type { AgentRunRepository } from "@platform-core/infrastructure/application-database/repositories/orchestration/AgentRunRepository.ts";
import { Migration20260501104413_auth } from "@platform-core/infrastructure/application-database/migrations/Migration20260501104413_auth.ts";
import { Migration20260501120537_events_org_id_backfill } from "@platform-core/infrastructure/application-database/migrations/Migration20260501120537_events_org_id_backfill.ts";
import { Migration20260501120538_events_org_id_notnull } from "@platform-core/infrastructure/application-database/migrations/Migration20260501120538_events_org_id_notnull.ts";
import { Migration20260501130000_composite_indexes } from "@platform-core/infrastructure/application-database/migrations/Migration20260501130000_composite_indexes.ts";
import { Migration20260501130100_flag_stubs } from "@platform-core/infrastructure/application-database/migrations/Migration20260501130100_flag_stubs.ts";
import { Migration20260501140000_schema_migration_ledger } from "@platform-core/infrastructure/application-database/migrations/Migration20260501140000_schema_migration_ledger.ts";
import { Migration20260501150000_account_verification } from "@platform-core/infrastructure/application-database/migrations/Migration20260501150000_account_verification.ts";
import { Migration20260502000001_orchestration_workflow_definitions } from "@platform-core/infrastructure/application-database/migrations/Migration20260502000001_orchestration_workflow_definitions.ts";
import { Migration20260502030300_agent_runs_symphony_columns } from "@platform-core/infrastructure/application-database/migrations/Migration20260502030300_agent_runs_symphony_columns.ts";
import { Migration20260502050000_routing_rules } from "@platform-core/infrastructure/application-database/migrations/Migration20260502050000_routing_rules.ts";
import { Migration20260502050200_skills_registry } from "@platform-core/infrastructure/application-database/migrations/Migration20260502050200_skills_registry.ts";
import { Migration20260502070100_docs_document_columns } from "@platform-core/infrastructure/application-database/migrations/Migration20260502070100_docs_document_columns.ts";
import { Migration20260502070200_docs_related_tables } from "@platform-core/infrastructure/application-database/migrations/Migration20260502070200_docs_related_tables.ts";

const MIGRATION_NAME = "Migration20260502070400_agent_runs_sandcastle_columns";
const PREVIOUS_MIGRATION_NAME = "Migration20260502070200_docs_related_tables";

const SANDCASTLE_COLUMNS = [
  "sandbox_mode",
  "iteration_count",
  "token_used",
  "transcript_path",
  "workspace_diff_path",
  "agent_name",
  "agent_version",
] as const;

interface BlankOrm {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

async function migrationsList(): Promise<MigrationObject[]> {
  const migrations: MigrationObject[] = [
    { name: "Migration20260501104413_auth", class: Migration20260501104413_auth },
    {
      name: "Migration20260501120537_events_org_id_backfill",
      class: Migration20260501120537_events_org_id_backfill,
    },
    {
      name: "Migration20260501120538_events_org_id_notnull",
      class: Migration20260501120538_events_org_id_notnull,
    },
    {
      name: "Migration20260501130000_composite_indexes",
      class: Migration20260501130000_composite_indexes,
    },
    {
      name: "Migration20260501130100_flag_stubs",
      class: Migration20260501130100_flag_stubs,
    },
    {
      name: "Migration20260501140000_schema_migration_ledger",
      class: Migration20260501140000_schema_migration_ledger,
    },
    {
      name: "Migration20260501150000_account_verification",
      class: Migration20260501150000_account_verification,
    },
    {
      name: "Migration20260502000001_orchestration_workflow_definitions",
      class: Migration20260502000001_orchestration_workflow_definitions,
    },
    {
      name: "Migration20260502030300_agent_runs_symphony_columns",
      class: Migration20260502030300_agent_runs_symphony_columns,
    },
    {
      name: "Migration20260502050000_routing_rules",
      class: Migration20260502050000_routing_rules,
    },
    {
      name: "Migration20260502050200_skills_registry",
      class: Migration20260502050200_skills_registry,
    },
    {
      name: "Migration20260502070100_docs_document_columns",
      class: Migration20260502070100_docs_document_columns,
    },
    {
      name: "Migration20260502070200_docs_related_tables",
      class: Migration20260502070200_docs_related_tables,
    },
  ];

  try {
    const mod = await import(
      "@platform-core/infrastructure/application-database/migrations/Migration20260502070400_agent_runs_sandcastle_columns.ts"
    );
    migrations.push({ name: MIGRATION_NAME, class: mod[MIGRATION_NAME] });
  } catch (error) {
    const message = String((error as { message?: unknown }).message ?? error);
    if (!message.includes("Cannot find module")) {
      throw error;
    }
  }

  return migrations;
}

async function buildBlankOrm(): Promise<BlankOrm> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });

  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
    migrationsList: await migrationsList(),
  };
  config.extensions = [Migrator];

  const orm = await MikroORMRuntime.init(config);

  return {
    orm,
    pglite,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

async function buildMigratedOrm(): Promise<BlankOrm> {
  const db = await buildBlankOrm();
  await db.orm.migrator.up();
  await new SeedService(db.orm.em).run();
  return db;
}

async function rows<T extends object>(
  orm: MikroORM,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await orm.em.getConnection().execute(sql, params)) as T[];
}

function quotedList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

describe("AgentRun entity metadata — Sandcastle columns", () => {
  let testDb: BlankOrm | undefined;

  afterAll(async () => {
    await testDb?.close();
  });

  it("declares Sandcastle properties, nullable searchDoc FK, and agent-org index", async () => {
    testDb = await buildMigratedOrm();
    const meta = testDb.orm.getMetadata().get(AgentRun);
    const props = meta.properties as Record<string, {
      fieldNames?: string[];
      kind?: ReferenceKind;
      nullable?: boolean;
      default?: unknown;
      type?: string;
    } | undefined>;

    const expected = {
      sandboxMode: "sandbox_mode",
      iterationCount: "iteration_count",
      tokenUsed: "token_used",
      transcriptPath: "transcript_path",
      workspaceDiffPath: "workspace_diff_path",
      agentName: "agent_name",
      agentVersion: "agent_version",
    } as const;

    for (const [propertyName, columnName] of Object.entries(expected)) {
      expect(props[propertyName]?.fieldNames).toContain(columnName);
    }

    expect(props["sandboxMode"]?.default).toBe("host");
    expect(props["iterationCount"]?.default).toBe(0);
    for (const nullableProperty of [
      "tokenUsed",
      "transcriptPath",
      "workspaceDiffPath",
      "agentName",
      "agentVersion",
    ]) {
      expect(props[nullableProperty]?.nullable).toBe(true);
    }

    expect(props["searchDoc"]?.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(props["searchDoc"]?.nullable).toBe(true);
    expect(props["searchDoc"]?.fieldNames).toContain("search_doc_id");

    const idx = meta.indexes?.find((index) => index.name === "agent_runs_agent_org");
    expect(idx).toBeDefined();
    expect(Array.isArray(idx!.properties) ? idx!.properties : [idx!.properties]).toEqual([
      "org",
      "agentName",
      "status",
      "createdAt",
    ]);

    const checkText = JSON.stringify(meta.checks ?? []);
    expect(checkText).toContain("sandbox_mode");
    expect(checkText).toContain("host");
    expect(checkText).toContain("docker");
    expect(checkText).toContain("podman");
  });
});

describe("Migration20260502070400_agent_runs_sandcastle_columns", () => {
  it("adds Sandcastle columns, defaults, CHECK, FK, and composite index", async () => {
    const db = await buildBlankOrm();
    try {
      await db.orm.migrator.up({ to: MIGRATION_NAME });

      const columnRows = await rows<{
        column_name: string;
        column_default: string | null;
        is_nullable: string;
      }>(
        db.orm,
        `
          select column_name, column_default, is_nullable
          from information_schema.columns
          where table_name = 'agent_runs'
            and column_name in (${quotedList([
              ...SANDCASTLE_COLUMNS,
              "search_doc_id",
              "status",
              "created_at",
            ])})
          order by column_name
        `,
      );

      expect(columnRows.map((row) => row.column_name).sort()).toEqual(
        [...SANDCASTLE_COLUMNS, "created_at", "search_doc_id", "status"].sort(),
      );
      expect(columnRows.find((row) => row.column_name === "sandbox_mode")?.column_default)
        .toBe("'host'::character varying");
      expect(columnRows.find((row) => row.column_name === "sandbox_mode")?.is_nullable)
        .toBe("NO");
      expect(columnRows.find((row) => row.column_name === "iteration_count")?.column_default)
        .toBe("0");
      expect(columnRows.find((row) => row.column_name === "iteration_count")?.is_nullable)
        .toBe("NO");

      const constraints = await rows<{ conname: string }>(
        db.orm,
        `
          select conname
          from pg_constraint
          where conname in (
            'agent_runs_sandbox_mode_check',
            'agent_runs_search_doc_id_foreign'
          )
          order by conname
        `,
      );
      expect(constraints.map((row) => row.conname)).toEqual([
        "agent_runs_sandbox_mode_check",
        "agent_runs_search_doc_id_foreign",
      ]);

      const indexes = await rows<{ indexname: string; indexdef: string }>(
        db.orm,
        `
          select indexname, indexdef
          from pg_indexes
          where tablename = 'agent_runs'
            and indexname = 'agent_runs_agent_org'
        `,
      );
      expect(indexes).toHaveLength(1);
      expect(indexes[0]!.indexdef).toContain(
        "USING btree (org_id, agent_name, status, created_at)",
      );

      await db.orm.migrator.down({ to: PREVIOUS_MIGRATION_NAME });

      const columnsAfterDown = await rows<{ column_name: string }>(
        db.orm,
        `
          select column_name
          from information_schema.columns
          where table_name = 'agent_runs'
            and column_name in (${quotedList([
              ...SANDCASTLE_COLUMNS,
              "search_doc_id",
              "status",
              "created_at",
            ])})
        `,
      );
      const indexesAfterDown = await rows<{ indexname: string }>(
        db.orm,
        `
          select indexname
          from pg_indexes
          where tablename = 'agent_runs'
            and indexname = 'agent_runs_agent_org'
        `,
      );
      expect(columnsAfterDown).toHaveLength(0);
      expect(indexesAfterDown).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("rejects unsupported sandbox_mode values at the database boundary", async () => {
    const db = await buildMigratedOrm();
    try {
      let caught: unknown;
      try {
        await db.orm.em.getConnection().execute(
          `insert into agent_runs (org_id, sandbox_mode) values (?, ?)`,
          [DEFAULT_ORG_ID, "firecracker"],
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(String((caught as { message?: unknown }).message ?? caught)).toContain(
        "agent_runs_sandbox_mode_check",
      );
    } finally {
      await db.close();
    }
  });

  it("uses agent_runs_agent_org for org-agent-status-created queries", async () => {
    const db = await buildMigratedOrm();
    try {
      const planRows = await rows<{ "QUERY PLAN": string }>(
        db.orm,
        `
          explain select *
          from agent_runs
          where org_id = ?
            and agent_name = ?
            and status = ?
          order by created_at
        `,
        [DEFAULT_ORG_ID, "codex", "succeeded"],
      );
      const planText = planRows.map((row) => row["QUERY PLAN"]).join("\n");
      expect(planText).toContain("agent_runs_agent_org");
      expect(planText).not.toMatch(/Seq Scan/i);
    } finally {
      await db.close();
    }
  });

  it("round-trips all seven Sandcastle properties and nullable searchDoc through repository findOne", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const searchDoc = em.create(SearchDocument, {
        org,
        entityKind: "agent_run",
        entityId: "00000000-0000-0000-0000-000000000999",
      });
      const run = em.create(AgentRun, {
        org,
        sandboxMode: "docker",
        iterationCount: 3,
        tokenUsed: 1234,
        transcriptPath: "transcripts/run.jsonl",
        workspaceDiffPath: "diffs/run.diff",
        agentName: "codex",
        agentVersion: "0.1.0",
        status: "succeeded",
        searchDoc,
      });

      em.persist([searchDoc, run]);
      await em.flush();
      em.clear();

      const repo = em.getRepository(AgentRun) as AgentRunRepository;
      const found = await repo.findOne({ id: run.id });

      expect(found?.sandboxMode).toBe("docker");
      expect(found?.iterationCount).toBe(3);
      expect(found?.tokenUsed).toBe(1234);
      expect(found?.transcriptPath).toBe("transcripts/run.jsonl");
      expect(found?.workspaceDiffPath).toBe("diffs/run.diff");
      expect(found?.agentName).toBe("codex");
      expect(found?.agentVersion).toBe("0.1.0");
      expect(found?.searchDoc?.id).toBe(searchDoc.id);
    } finally {
      await db.close();
    }
  });
});
