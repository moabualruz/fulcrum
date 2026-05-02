/**
 * TDD — AgentRun orchestration-state columns + partial indexes.
 *
 * RED target: AgentRun lacks orchestration_state/retry fields and the migration
 * adding them. GREEN target: DB rejects invalid states and the claimed-task
 * partial unique index prevents double-dispatch.
 */

import { afterAll, describe, expect, it } from "bun:test";
import type { MigrationObject } from "@mikro-orm/core";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "../../../src/db/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "../../../src/db/seed.ts";
import { Org } from "../../../src/db/entities/auth/Org.ts";
import { Task } from "../../../src/db/entities/tasks/Task.ts";
import { AgentRun } from "../../../src/db/entities/orchestration/AgentRun.ts";
import type { AgentRunRepository } from "../../../src/db/repositories/orchestration/AgentRunRepository.ts";
import { Migration20260501104413_auth } from "../../../src/db/migrations/Migration20260501104413_auth.ts";
import { Migration20260501120537_events_org_id_backfill } from "../../../src/db/migrations/Migration20260501120537_events_org_id_backfill.ts";
import { Migration20260501120538_events_org_id_notnull } from "../../../src/db/migrations/Migration20260501120538_events_org_id_notnull.ts";
import { Migration20260501130000_composite_indexes } from "../../../src/db/migrations/Migration20260501130000_composite_indexes.ts";
import { Migration20260501130100_flag_stubs } from "../../../src/db/migrations/Migration20260501130100_flag_stubs.ts";
import { Migration20260501140000_schema_migration_ledger } from "../../../src/db/migrations/Migration20260501140000_schema_migration_ledger.ts";
import { Migration20260501150000_account_verification } from "../../../src/db/migrations/Migration20260501150000_account_verification.ts";
import { Migration20260502000001_orchestration_workflow_definitions } from "../../../src/db/migrations/Migration20260502000001_orchestration_workflow_definitions.ts";
import { Migration20260502050000_routing_rules } from "../../../src/db/migrations/Migration20260502050000_routing_rules.ts";
import { Migration20260502050200_skills_registry } from "../../../src/db/migrations/Migration20260502050200_skills_registry.ts";
import { Migration20260502070100_docs_document_columns } from "../../../src/db/migrations/Migration20260502070100_docs_document_columns.ts";
import { Migration20260502070200_docs_related_tables } from "../../../src/db/migrations/Migration20260502070200_docs_related_tables.ts";
import { Migration20260502070400_agent_runs_sandcastle_columns } from "../../../src/db/migrations/Migration20260502070400_agent_runs_sandcastle_columns.ts";

const MIGRATION_NAME = "Migration20260502030300_agent_runs_symphony_columns";
const PREVIOUS_MIGRATION_NAME = "Migration20260502000001_orchestration_workflow_definitions";

const ORCHESTRATION_COLUMNS = [
  "orchestration_state",
  "attempt_count",
  "next_retry_at",
  "workspace_path",
  "last_error_kind",
] as const;

const PARTIAL_INDEX_NAMES = [
  "agent_runs_claimed_unique",
  "agent_runs_dispatch_poll",
  "agent_runs_stall_scan",
] as const;

const ORCHESTRATION_STATES = [
  "unclaimed",
  "claimed",
  "running",
  "retry_queued",
  "released",
  "succeeded",
  "failed",
  "timed_out",
  "stalled",
  "cancelled",
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
  ];

  try {
    const mod = await import(
      "../../../src/db/migrations/Migration20260502030300_agent_runs_symphony_columns.ts"
    );
    migrations.push({ name: MIGRATION_NAME, class: mod[MIGRATION_NAME] });
  } catch (error) {
    const message = String((error as { message?: unknown }).message ?? error);
    if (!message.includes("Cannot find module")) {
      throw error;
    }
  }

  migrations.push(
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
    {
      name: "Migration20260502070400_agent_runs_sandcastle_columns",
      class: Migration20260502070400_agent_runs_sandcastle_columns,
    },
  );

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

describe("AgentRun entity metadata — orchestration columns", () => {
  let testDb: BlankOrm | undefined;

  afterAll(async () => {
    await testDb?.close();
  });

  it("declares the five Symphony state columns with D1 orchestration naming", async () => {
    testDb = await buildMigratedOrm();
    const meta = testDb.orm.getMetadata().get(AgentRun);

    const expected = {
      orchestrationState: "orchestration_state",
      attemptCount: "attempt_count",
      nextRetryAt: "next_retry_at",
      workspacePath: "workspace_path",
      lastErrorKind: "last_error_kind",
    } as const;
    const props = meta.properties as Record<
      string,
      { fieldNames?: string[]; type?: string } | undefined
    >;

    for (const [propertyName, columnName] of Object.entries(expected)) {
      const prop = props[propertyName];
      expect(prop).toBeDefined();
      expect(prop?.fieldNames).toContain(columnName);
    }
    expect(props["workspacePath"]?.type).toBe("text");

    const checkText = JSON.stringify(meta.checks ?? []);
    expect(checkText).toContain("orchestration_state");
    for (const state of ORCHESTRATION_STATES) {
      expect(checkText).toContain(state);
    }
    expect(checkText).toContain("agent_runs_claimed_task_id_check");
  });
});

describe("Migration20260502030300_agent_runs_symphony_columns", () => {
  it("runs forward and backward, exposing partial indexes through pg_indexes", async () => {
    const db = await buildBlankOrm();
    try {
      await db.orm.migrator.up({ to: MIGRATION_NAME });

      const columnRows = await rows<{
        column_name: string;
        column_default: string | null;
        data_type: string;
      }>(
        db.orm,
        `
          select column_name, column_default, data_type
          from information_schema.columns
          where table_name = 'agent_runs'
            and column_name in (${quotedList(ORCHESTRATION_COLUMNS)})
          order by column_name
        `,
      );
      expect(columnRows.map((row) => row.column_name).sort()).toEqual(
        [...ORCHESTRATION_COLUMNS].sort(),
      );
      expect(columnRows.find((row) => row.column_name === "attempt_count")?.column_default)
        .toBe("0");
      expect(columnRows.find((row) => row.column_name === "workspace_path")?.data_type)
        .toBe("text");

      const constraintRows = await rows<{ conname: string }>(
        db.orm,
        `
          select conname
          from pg_constraint
          where conname = 'agent_runs_claimed_task_id_check'
        `,
      );
      expect(constraintRows.map((row) => row.conname)).toContain(
        "agent_runs_claimed_task_id_check",
      );

      const indexRows = await rows<{ indexname: string; indexdef: string }>(
        db.orm,
        `
          select indexname, indexdef
          from pg_indexes
          where tablename = 'agent_runs'
            and indexname in (${quotedList(PARTIAL_INDEX_NAMES)})
          order by indexname
        `,
      );

      expect(indexRows.map((row) => row.indexname).sort()).toEqual(
        [...PARTIAL_INDEX_NAMES].sort(),
      );
      expect(indexRows.find((row) => row.indexname === "agent_runs_claimed_unique")?.indexdef)
        .toContain("WHERE ((orchestration_state)::text = 'claimed'::text)");
      expect(indexRows.find((row) => row.indexname === "agent_runs_dispatch_poll")?.indexdef)
        .toContain("retry_queued");
      expect(indexRows.find((row) => row.indexname === "agent_runs_stall_scan")?.indexdef)
        .toContain("running");

      await db.orm.migrator.down({ to: PREVIOUS_MIGRATION_NAME });

      const columnsAfterDown = await rows<{ column_name: string }>(
        db.orm,
        `
          select column_name
          from information_schema.columns
          where table_name = 'agent_runs'
            and column_name in (${quotedList(ORCHESTRATION_COLUMNS)})
        `,
      );
      const indexesAfterDown = await rows<{ indexname: string }>(
        db.orm,
        `
          select indexname
          from pg_indexes
          where tablename = 'agent_runs'
            and indexname in (${quotedList(PARTIAL_INDEX_NAMES)})
        `,
      );

      expect(columnsAfterDown).toHaveLength(0);
      expect(indexesAfterDown).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("rejects invalid orchestration_state strings at the database boundary", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const repo = em.getRepository(AgentRun) as AgentRunRepository;

      let caught: unknown;
      try {
        await repo.insert({
          org,
          orchestrationState: "paused",
        } as never);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(String((caught as { message?: unknown }).message ?? caught)).toContain(
        "agent_runs_orchestration_state_check",
      );
    } finally {
      await db.close();
    }
  });

  it("allows only one claimed run per task through the partial unique index", async () => {
    const db = await buildMigratedOrm();
    try {
      const taskId = crypto.randomUUID();
      await rows(db.orm, `insert into "tasks" ("id", "org_id") values (?, ?)`, [
        taskId,
        DEFAULT_ORG_ID,
      ]);

      const insertClaimed = async () => {
        const em = db.orm.em.fork();
        const repo = em.getRepository(AgentRun) as AgentRunRepository;
        return repo.insert({
          org: em.getReference(Org, DEFAULT_ORG_ID),
          task: em.getReference(Task, taskId),
          orchestrationState: "claimed",
        } as never);
      };

      const results = await Promise.allSettled([insertClaimed(), insertClaimed()]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it("rejects claimed runs without task_id before unique-index NULL semantics apply", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const repo = em.getRepository(AgentRun) as AgentRunRepository;

      let caught: unknown;
      try {
        await repo.insert({
          org: em.getReference(Org, DEFAULT_ORG_ID),
          orchestrationState: "claimed",
        } as never);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(String((caught as { message?: unknown }).message ?? caught)).toContain(
        "agent_runs_claimed_task_id_check",
      );
    } finally {
      await db.close();
    }
  });

  it("rejects cross-org task links on agent runs", async () => {
    const db = await buildMigratedOrm();
    try {
      const setupEm = db.orm.em.fork();
      const now = new Date();
      const otherOrgId = crypto.randomUUID();
      const otherOrg = setupEm.create(Org, {
        id: otherOrgId,
        name: "AgentRun Other Org",
        slug: `agent-run-other-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      });
      setupEm.persist(otherOrg);
      await setupEm.flush();
      const otherTaskId = crypto.randomUUID();
      await rows(db.orm, `insert into "tasks" ("id", "org_id") values (?, ?)`, [
        otherTaskId,
        otherOrgId,
      ]);

      await expect(
        rows(db.orm, `insert into "agent_runs" ("org_id", "task_id") values (?, ?)`, [
          DEFAULT_ORG_ID,
          otherTaskId,
        ]),
      ).rejects.toThrow("agent_runs_task_org_foreign");
    } finally {
      await db.close();
    }
  });

  it("sets agent_runs.task_id to null when the linked task is deleted", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const taskId = crypto.randomUUID();
      await rows(db.orm, `insert into "tasks" ("id", "org_id") values (?, ?)`, [
        taskId,
        DEFAULT_ORG_ID,
      ]);
      const run = em.create(AgentRun, { org, task: em.getReference(Task, taskId) });
      em.persist(run);
      await em.flush();

      await rows(db.orm, `delete from "tasks" where "id" = ?`, [taskId]);
      const [saved] = await rows<{ task_id: string | null }>(
        db.orm,
        `select "task_id" from "agent_runs" where "id" = ?`,
        [run.id],
      );

      expect(saved?.task_id).toBeNull();
    } finally {
      await db.close();
    }
  });
});
