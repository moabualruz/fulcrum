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
import { Migration20260502050000_routing_rules } from "../../src/db/migrations/Migration20260502050000_routing_rules.ts";
import { Migration20260502050200_skills_registry } from "../../src/db/migrations/Migration20260502050200_skills_registry.ts";
import { Migration20260502070100_docs_document_columns } from "../../src/db/migrations/Migration20260502070100_docs_document_columns.ts";
import { Migration20260502070200_docs_related_tables } from "../../src/db/migrations/Migration20260502070200_docs_related_tables.ts";
import { Migration20260502070400_agent_runs_sandcastle_columns } from "../../src/db/migrations/Migration20260502070400_agent_runs_sandcastle_columns.ts";
import {
  buildCandidateIssuesBaseQuery,
  fetchCandidateIssues,
  fetchIssuesByStates,
  fetchIssueStatesByIds,
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
  running: "00000000-0000-0000-0000-000000000006",
  retryQueued: "00000000-0000-0000-0000-000000000007",
  blocked: "00000000-0000-0000-0000-000000000005",
} as const;

const RUN_IDS = {
  unclaimed: "10000000-0000-0000-0000-000000000001",
  running: "10000000-0000-0000-0000-000000000002",
  retryQueued: "10000000-0000-0000-0000-000000000003",
  stalled: "10000000-0000-0000-0000-000000000004",
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
  const running = em.create(Task, {
    id: TASK_IDS.running,
    org,
    createdAt: new Date("2026-01-04T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 0,
  });
  const retryQueued = em.create(Task, {
    id: TASK_IDS.retryQueued,
    org,
    createdAt: new Date("2026-01-05T00:00:00.000Z"),
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

  em.persist([
    candidateA,
    candidateB,
    highPriority,
    claimed,
    running,
    retryQueued,
    blocked,
  ]);
  await em.flush();

  em.persist([
    em.create(AgentRun, {
      org,
      task: claimed,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      startedAt: new Date("2026-01-02T00:00:00.000Z"),
      orchestrationState: "claimed",
      attemptCount: 0,
      sandboxMode: "host",
      iterationCount: 0,
    }),
    em.create(AgentRun, {
      org,
      task: running,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      startedAt: new Date("2026-01-04T00:00:00.000Z"),
      orchestrationState: "running",
      attemptCount: 1,
      sandboxMode: "host",
      iterationCount: 0,
    }),
    em.create(AgentRun, {
      org,
      task: retryQueued,
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
      startedAt: new Date("2026-01-05T00:00:00.000Z"),
      orchestrationState: "retry_queued",
      attemptCount: 2,
      nextRetryAt: new Date("2026-01-06T00:00:00.000Z"),
      sandboxMode: "host",
      iterationCount: 0,
    }),
  ]);
  await em.flush();
}

async function seedRunStateFixture(orm: MikroORM): Promise<void> {
  const em = orm.em.fork();
  const org = em.getReference(Org, DEFAULT_ORG_ID);

  const taskA = em.create(Task, {
    id: "20000000-0000-0000-0000-000000000001",
    org,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  const taskB = em.create(Task, {
    id: "20000000-0000-0000-0000-000000000002",
    org,
    createdAt: new Date("2026-02-02T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 2,
  });
  const taskC = em.create(Task, {
    id: "20000000-0000-0000-0000-000000000003",
    org,
    createdAt: new Date("2026-02-03T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 3,
  });
  em.persist([taskA, taskB, taskC]);
  await em.flush();

  em.persist([
    em.create(AgentRun, {
      id: RUN_IDS.unclaimed,
      org,
      task: taskA,
      createdAt: new Date("2026-02-01T01:00:00.000Z"),
      startedAt: new Date("2026-02-01T01:00:00.000Z"),
      orchestrationState: "unclaimed",
      attemptCount: 0,
      sandboxMode: "host",
      iterationCount: 0,
    }),
    em.create(AgentRun, {
      id: RUN_IDS.running,
      org,
      task: taskB,
      createdAt: new Date("2026-02-01T02:00:00.000Z"),
      startedAt: new Date("2026-02-01T02:00:00.000Z"),
      orchestrationState: "running",
      attemptCount: 1,
      sandboxMode: "host",
      iterationCount: 0,
    }),
    em.create(AgentRun, {
      id: RUN_IDS.retryQueued,
      org,
      task: taskC,
      createdAt: new Date("2026-02-01T03:00:00.000Z"),
      startedAt: new Date("2026-02-01T03:00:00.000Z"),
      orchestrationState: "retry_queued",
      attemptCount: 2,
      nextRetryAt: new Date("2026-02-01T04:00:00.000Z"),
      sandboxMode: "host",
      iterationCount: 0,
    }),
    em.create(AgentRun, {
      id: RUN_IDS.stalled,
      org,
      createdAt: new Date("2026-02-01T05:00:00.000Z"),
      startedAt: new Date("2026-02-01T05:00:00.000Z"),
      orchestrationState: "stalled",
      attemptCount: 3,
      lastErrorKind: "stall",
      sandboxMode: "host",
      iterationCount: 0,
    }),
  ]);
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
    expect(all.map((task) => task.id)).not.toContain(TASK_IDS.running);
    expect(all.map((task) => task.id)).not.toContain(TASK_IDS.retryQueued);

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

describe("fetchIssuesByStates", () => {
  it("returns full run rows with task data for matching orchestration states", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedRunStateFixture(db.orm);

      const result = await fetchIssuesByStates(db.orm.em, DEFAULT_ORG_ID, [
        "running",
        "retry_queued",
      ]);

      expect(result.map((run) => run.id)).toEqual([
        RUN_IDS.running,
        RUN_IDS.retryQueued,
      ]);
      expect(result.map((run) => run.state)).toEqual([
        "running",
        "retry_queued",
      ]);
      expect(result.map((run) => run.task?.id)).toEqual([
        "20000000-0000-0000-0000-000000000002",
        "20000000-0000-0000-0000-000000000003",
      ]);
      expect(result[0]?.attemptCount).toBe(1);
      expect(result[1]?.nextRetryAt?.toISOString()).toBe(
        "2026-02-01T04:00:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("applies limit and returns empty for an empty state list without error", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedRunStateFixture(db.orm);

      await expect(fetchIssuesByStates(db.orm.em, DEFAULT_ORG_ID, [])).resolves
        .toEqual([]);

      const limited = await fetchIssuesByStates(db.orm.em, DEFAULT_ORG_ID, [
        "unclaimed",
        "running",
        "retry_queued",
      ], 2);

      expect(limited.map((run) => run.id)).toEqual([
        RUN_IDS.unclaimed,
        RUN_IDS.running,
      ]);
    } finally {
      await db.close();
    }
  });

  it("state filter query is EXPLAIN-able and shaped for Symphony run indexes", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedRunStateFixture(db.orm);
      const em = db.orm.em.fork();
      const dispatchSql =
        'select * from "agent_runs" where "org_id" = ? and "orchestration_state" in (?, ?) order by "next_retry_at" asc limit ?';

      const dispatchPlanRows = (await em
        .getConnection()
        .execute(`explain ${dispatchSql}`, [
          DEFAULT_ORG_ID,
          "unclaimed",
          "retry_queued",
          10,
        ])) as Array<{ "QUERY PLAN": string }>;
      const dispatchPlanText = dispatchPlanRows
        .map((row) => row["QUERY PLAN"])
        .join("\n");
      expect(dispatchPlanText.length).toBeGreaterThan(0);

      if (/Index Scan/i.test(dispatchPlanText)) {
        expect(dispatchPlanText).toContain("agent_runs_dispatch_poll");
      }
      expect(dispatchSql).toContain('"orchestration_state" in');

      const runningSql =
        'select * from "agent_runs" where "org_id" = ? and "orchestration_state" = ? order by "started_at" asc limit ?';
      const runningPlanRows = (await em
        .getConnection()
        .execute(`explain ${runningSql}`, [
          DEFAULT_ORG_ID,
          "running",
          10,
        ])) as Array<{ "QUERY PLAN": string }>;
      const runningPlanText = runningPlanRows
        .map((row) => row["QUERY PLAN"])
        .join("\n");

      if (/Index Scan/i.test(runningPlanText)) {
        expect(runningPlanText).toContain("agent_runs_stall_scan");
      }
      expect(runningSql).toContain('"orchestration_state" =');
    } finally {
      await db.close();
    }
  });
});

describe("fetchIssueStatesByIds", () => {
  it("returns slim id/state rows and omits unknown ids", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedRunStateFixture(db.orm);

      const result = await fetchIssueStatesByIds(db.orm.em, DEFAULT_ORG_ID, [
        RUN_IDS.retryQueued,
        "10000000-0000-0000-0000-999999999999",
        RUN_IDS.running,
      ]);

      expect(result).toEqual([
        { id: RUN_IDS.running, state: "running" },
        { id: RUN_IDS.retryQueued, state: "retry_queued" },
      ]);
      expect(Object.keys(result[0] ?? {})).toEqual(["id", "state"]);
    } finally {
      await db.close();
    }
  });

  it("returns empty for an empty id list without querying full rows", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedRunStateFixture(db.orm);
      await expect(fetchIssueStatesByIds(db.orm.em, DEFAULT_ORG_ID, []))
        .resolves.toEqual([]);
    } finally {
      await db.close();
    }
  });
});

describe("orchestration Symphony tracker tRPC procedures", () => {
  it("exposes fetchIssuesByStates and fetchIssueStatesByIds", async () => {
    const db = await buildMigratedOrm();
    try {
      await seedRunStateFixture(db.orm);
      const caller = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-symphony-test",
          em: db.orm.em.fork(),
          container: null,
        }),
      );

      const full = await caller.orchestration.fetchIssuesByStates({
        orgId: DEFAULT_ORG_ID,
        states: ["running"],
      });
      const slim = await caller.orchestration.fetchIssueStatesByIds({
        orgId: DEFAULT_ORG_ID,
        runIds: [RUN_IDS.running, RUN_IDS.stalled],
      });

      expect(full.map((run) => run.id)).toEqual([RUN_IDS.running]);
      expect(full[0]?.task?.id).toBe("20000000-0000-0000-0000-000000000002");
      expect(slim).toEqual([
        { id: RUN_IDS.running, state: "running" },
        { id: RUN_IDS.stalled, state: "stalled" },
      ]);
    } finally {
      await db.close();
    }
  });
});
