/**
 * TDD — Symphony tracker fetchCandidateIssues.
 *
 * RED target: src/orchestration/symphony/tracker.ts does not exist yet.
 * GREEN target: ready tasks are fetched in SPEC order while blocked and
 * already-claimed tasks are excluded.
 */

import { afterAll, describe, expect, it } from "bun:test";
import type { MigrationObject } from "@mikro-orm/core";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "../../src/db/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "../../src/db/seed.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { AgentRun } from "../../src/db/entities/orchestration/AgentRun.ts";
import type { TaskRepository } from "../../src/db/repositories/tasks/TaskRepository.ts";
import { Migration20260501104413_auth } from "../../src/db/migrations/Migration20260501104413_auth.ts";
import { Migration20260501120537_events_org_id_backfill } from "../../src/db/migrations/Migration20260501120537_events_org_id_backfill.ts";
import { Migration20260501120538_events_org_id_notnull } from "../../src/db/migrations/Migration20260501120538_events_org_id_notnull.ts";
import { Migration20260501130000_composite_indexes } from "../../src/db/migrations/Migration20260501130000_composite_indexes.ts";
import { Migration20260501130100_flag_stubs } from "../../src/db/migrations/Migration20260501130100_flag_stubs.ts";
import { Migration20260501140000_schema_migration_ledger } from "../../src/db/migrations/Migration20260501140000_schema_migration_ledger.ts";
import { Migration20260501150000_account_verification } from "../../src/db/migrations/Migration20260501150000_account_verification.ts";
import { Migration20260502000001_orchestration_workflow_definitions } from "../../src/db/migrations/Migration20260502000001_orchestration_workflow_definitions.ts";
import { Migration20260502030300_agent_runs_symphony_columns } from "../../src/db/migrations/Migration20260502030300_agent_runs_symphony_columns.ts";
import {
  buildCandidateIssuesBaseQuery,
  fetchCandidateIssues,
} from "../../src/orchestration/symphony/tracker.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);

const TASK_IDS = {
  candidateA: "00000000-0000-0000-0000-000000000003",
  candidateB: "00000000-0000-0000-0000-000000000001",
  highPriority: "00000000-0000-0000-0000-000000000004",
  claimed: "00000000-0000-0000-0000-000000000002",
  blocked: "00000000-0000-0000-0000-000000000005",
} as const;

interface BlankOrm {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

async function buildBlankOrm(): Promise<BlankOrm> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });

  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
    migrationsList: [
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
    ] satisfies MigrationObject[],
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

function mockSession() {
  return {
    id: "sess-symphony-test",
    userId: "user-symphony-test",
    orgId: DEFAULT_ORG_ID,
    activeOrganizationId: DEFAULT_ORG_ID,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-symphony-test",
    ipAddress: null,
    userAgent: null,
  };
}

async function seedCandidateFixture(orm: MikroORM): Promise<void> {
  const em = orm.em.fork();
  const org = em.getReference(Org, DEFAULT_ORG_ID);
  const tieDate = new Date("2026-01-01T00:00:00.000Z");

  const candidateA = em.create(Task, {
    id: TASK_IDS.candidateA,
    org,
    createdAt: tieDate,
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  const candidateB = em.create(Task, {
    id: TASK_IDS.candidateB,
    org,
    createdAt: tieDate,
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  const highPriority = em.create(Task, {
    id: TASK_IDS.highPriority,
    org,
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 0,
  });
  const claimed = em.create(Task, {
    id: TASK_IDS.claimed,
    org,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 0,
  });
  const blocked = em.create(Task, {
    id: TASK_IDS.blocked,
    org,
    createdAt: new Date("2025-12-31T00:00:00.000Z"),
    blockedByIds: [TASK_IDS.candidateB],
    status: "ready",
    priority: 0,
  });

  em.persist([candidateA, candidateB, highPriority, claimed, blocked]);
  await em.flush();

  em.create(AgentRun, {
    org,
    task: claimed,
    startedAt: new Date("2026-01-02T00:00:00.000Z"),
    orchestrationState: "claimed",
    attemptCount: 0,
  });
  await em.flush();
}

describe("fetchCandidateIssues", () => {
  let lastDb: BlankOrm | undefined;

  afterAll(async () => {
    await lastDb?.close();
  });

  it("returns ready unblocked unclaimed tasks in SPEC order and applies limit", async () => {
    lastDb = await buildMigratedOrm();
    await seedCandidateFixture(lastDb.orm);

    const all = await fetchCandidateIssues(lastDb.orm.em, DEFAULT_ORG_ID, 10);
    expect(all.map((task) => task.id)).toEqual([
      TASK_IDS.highPriority,
      TASK_IDS.candidateB,
      TASK_IDS.candidateA,
    ]);
    expect(all.every((task) => task.status === "ready")).toBe(true);
    expect(all.map((task) => task.id)).not.toContain(TASK_IDS.blocked);
    expect(all.map((task) => task.id)).not.toContain(TASK_IDS.claimed);

    const limited = await fetchCandidateIssues(lastDb.orm.em, DEFAULT_ORG_ID, 2);
    expect(limited.map((task) => task.id)).toEqual([
      TASK_IDS.highPriority,
      TASK_IDS.candidateB,
    ]);
  });

  it("allows tasks whose blockers are already resolved", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const resolved = em.create(Task, {
        id: "00000000-0000-0000-0000-000000000101",
        org,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        blockedByIds: [],
        status: "done",
        priority: 0,
      });
      const eligible = em.create(Task, {
        id: "00000000-0000-0000-0000-000000000102",
        org,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        blockedByIds: [resolved.id],
        status: "ready",
        priority: 0,
      });
      em.persist([resolved, eligible]);
      await em.flush();

      const result = await fetchCandidateIssues(db.orm.em, DEFAULT_ORG_ID, 10);
      expect(result.map((task) => task.id)).toEqual([eligible.id]);
    } finally {
      await db.close();
    }
  });

  it("candidate base query is EXPLAIN-able and shaped for tasks_dispatch_eligible", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedCandidateFixture(db.orm);
      const em = db.orm.em.fork();
      const repo = em.getRepository(Task) as TaskRepository;
      const qb = buildCandidateIssuesBaseQuery(repo, DEFAULT_ORG_ID);
      const sql = qb.getQuery();

      // C6 carve-out: EXPLAIN is test-only planner introspection. App code uses
      // the MikroORM QueryBuilder helper under test.
      const planRows = (await em
        .getConnection()
        .execute(`explain ${sql}`, qb.getParams() as unknown[])) as Array<{
        "QUERY PLAN": string;
      }>;
      const planText = planRows.map((row) => row["QUERY PLAN"]).join("\n");
      expect(planText.length).toBeGreaterThan(0);

      if (/Index Scan/i.test(planText)) {
        expect(planText).toContain("tasks_dispatch_eligible");
      }
      expect(sql.toLowerCase()).toContain("status");
      expect(sql.toLowerCase()).toMatch(
        /order by.*priority.*asc.*created_at.*asc.*id.*asc/s,
      );
    } finally {
      await db.close();
    }
  });
});

describe("orchestration.fetchCandidateIssues tRPC procedure", () => {
  it("is callable by authenticated web/tRPC callers", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedCandidateFixture(db.orm);
      const caller = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-symphony-test",
          em: db.orm.em.fork(),
          container: null,
        }),
      );

      const result = await caller.orchestration.fetchCandidateIssues({
        orgId: DEFAULT_ORG_ID,
        limit: 10,
      });

      expect(result.map((task) => task.id)).toEqual([
        TASK_IDS.highPriority,
        TASK_IDS.candidateB,
        TASK_IDS.candidateA,
      ]);
    } finally {
      await db.close();
    }
  });
});
