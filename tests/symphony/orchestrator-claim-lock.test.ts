/**
 * TDD — claimRun claim-lock: Unclaimed → Claimed with optimistic lock + events row.
 *
 * RED target: src/orchestration/symphony/orchestrator.ts does not exist yet.
 * GREEN target: exactly one of two parallel claimRun calls succeeds; the other
 *   throws ClaimConflictError; events table has exactly one state_changed row.
 *
 * Closes (issue): .scratch/agent-os-vision/03-symphony-orchestration/issues/06-state-machine-claim-lock.md
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
import { Event } from "../../src/db/entities/core/Event.ts";
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
import { claimRun, ClaimConflictError } from "../../src/orchestration/symphony/orchestrator.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);

const CLAIM_MIGRATION_NAME = "Migration20260502090100_agent_runs_claimed_by";

interface BlankOrm {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

async function migrationsList(): Promise<MigrationObject[]> {
  const migrations: MigrationObject[] = [
    { name: "Migration20260501104413_auth", class: Migration20260501104413_auth },
    { name: "Migration20260501120537_events_org_id_backfill", class: Migration20260501120537_events_org_id_backfill },
    { name: "Migration20260501120538_events_org_id_notnull", class: Migration20260501120538_events_org_id_notnull },
    { name: "Migration20260501130000_composite_indexes", class: Migration20260501130000_composite_indexes },
    { name: "Migration20260501130100_flag_stubs", class: Migration20260501130100_flag_stubs },
    { name: "Migration20260501140000_schema_migration_ledger", class: Migration20260501140000_schema_migration_ledger },
    { name: "Migration20260501150000_account_verification", class: Migration20260501150000_account_verification },
    { name: "Migration20260502000001_orchestration_workflow_definitions", class: Migration20260502000001_orchestration_workflow_definitions },
    { name: "Migration20260502030300_agent_runs_symphony_columns", class: Migration20260502030300_agent_runs_symphony_columns },
    { name: "Migration20260502050000_routing_rules", class: Migration20260502050000_routing_rules },
    { name: "Migration20260502050200_skills_registry", class: Migration20260502050200_skills_registry },
    { name: "Migration20260502070100_docs_document_columns", class: Migration20260502070100_docs_document_columns },
    { name: "Migration20260502070200_docs_related_tables", class: Migration20260502070200_docs_related_tables },
    { name: "Migration20260502070400_agent_runs_sandcastle_columns", class: Migration20260502070400_agent_runs_sandcastle_columns },
  ];

  try {
    const mod = await import(
      "../../src/db/migrations/Migration20260502090100_agent_runs_claimed_by.ts"
    );
    migrations.push({ name: CLAIM_MIGRATION_NAME, class: mod[CLAIM_MIGRATION_NAME] });
  } catch (error) {
    const message = String((error as { message?: unknown }).message ?? error);
    if (!message.includes("Cannot find module")) throw error;
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

function mockSession() {
  return {
    id: "sess-claim-lock-test",
    userId: "user-claim-lock-test",
    orgId: DEFAULT_ORG_ID,
    activeOrganizationId: DEFAULT_ORG_ID,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-claim-lock-test",
    ipAddress: null,
    userAgent: null,
  };
}

async function seedUnclaimedRun(
  orm: MikroORM,
): Promise<{ taskId: string; runId: string }> {
  const em = orm.em.fork();
  const org = em.getReference(Org, DEFAULT_ORG_ID);

  const task = em.create(Task, {
    id: "30000000-0000-0000-0000-000000000001",
    org,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  em.persist(task);
  await em.flush();

  const run = em.create(AgentRun, {
    id: "40000000-0000-0000-0000-000000000001",
    org,
    task,
    createdAt: new Date("2026-05-01T00:01:00.000Z"),
    startedAt: new Date("2026-05-01T00:01:00.000Z"),
    orchestrationState: "unclaimed",
    attemptCount: 0,
    sandboxMode: "host",
    iterationCount: 0,
  });
  em.persist(run);
  await em.flush();

  return { taskId: task.id, runId: run.id };
}

describe("claimRun — claim-lock state machine", () => {
  let lastDb: BlankOrm | undefined;

  afterAll(async () => {
    await lastDb?.close();
  });

  it("transitions unclaimed → claimed and emits a state_changed event", async () => {
    lastDb = await buildMigratedOrm();
    const { taskId, runId } = await seedUnclaimedRun(lastDb.orm);

    const result = await claimRun(lastDb.orm.em, DEFAULT_ORG_ID, taskId, "instance-A");

    expect(result.runId).toBe(runId);

    // Verify DB state: run is now claimed
    const em = lastDb.orm.em.fork();
    const run = await em.findOneOrFail(AgentRun, { id: runId });
    expect(run.orchestrationState).toBe("claimed");

    // Verify events table: exactly one state_changed row for this run
    const events = await em.find(Event, {
      subjectKind: "agent_run",
      subjectId: runId,
      verb: "state_changed",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ from: "unclaimed", to: "claimed" });
  });

  it("throws ClaimConflictError when run is already claimed", async () => {
    const db = await buildMigratedOrm();
    try {
      const { taskId } = await seedUnclaimedRun(db.orm);

      // First claim succeeds
      await claimRun(db.orm.em, DEFAULT_ORG_ID, taskId, "instance-A");

      // Second claim on same task → ClaimConflictError
      let caught: unknown;
      try {
        await claimRun(db.orm.em, DEFAULT_ORG_ID, taskId, "instance-B");
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ClaimConflictError);
    } finally {
      await db.close();
    }
  });

  it("parallel claims: exactly one succeeds, one throws ClaimConflictError; events has exactly one row", async () => {
    const db = await buildMigratedOrm();
    try {
      const { taskId, runId } = await seedUnclaimedRun(db.orm);

      const results = await Promise.allSettled([
        claimRun(db.orm.em, DEFAULT_ORG_ID, taskId, "instance-A"),
        claimRun(db.orm.em, DEFAULT_ORG_ID, taskId, "instance-B"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(
        (rejected[0] as PromiseRejectedResult).reason,
      ).toBeInstanceOf(ClaimConflictError);

      // Events table must have exactly one state_changed row after both settle
      const em = db.orm.em.fork();
      const events = await em.find(Event, {
        subjectKind: "agent_run",
        subjectId: runId,
        verb: "state_changed",
      });
      expect(events).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it("claimRun on non-existent taskId throws ClaimConflictError", async () => {
    const db = await buildMigratedOrm();
    try {
      let caught: unknown;
      try {
        await claimRun(
          db.orm.em,
          DEFAULT_ORG_ID,
          "99000000-0000-0000-0000-000000000001",
          "instance-A",
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ClaimConflictError);
    } finally {
      await db.close();
    }
  });
});

describe("orchestration.claimRun tRPC procedure", () => {
  it("is callable by authenticated callers and returns runId", async () => {
    const db = await buildMigratedOrm();
    try {
      const { taskId, runId } = await seedUnclaimedRun(db.orm);
      const caller = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-claim-lock-test",
          em: db.orm.em.fork(),
          container: null,
        }),
      );

      const result = await caller.orchestration.claimRun({
        orgId: DEFAULT_ORG_ID,
        taskId,
        instanceId: "instance-trpc-test",
      });

      expect(result.runId).toBe(runId);
    } finally {
      await db.close();
    }
  });

  it("tRPC procedure returns ClaimConflictError as CONFLICT when already claimed", async () => {
    const db = await buildMigratedOrm();
    try {
      const { taskId } = await seedUnclaimedRun(db.orm);

      const callerA = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-claim-lock-test",
          em: db.orm.em.fork(),
          container: null,
        }),
      );
      await callerA.orchestration.claimRun({
        orgId: DEFAULT_ORG_ID,
        taskId,
        instanceId: "instance-A",
      });

      const callerB = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-claim-lock-test",
          em: db.orm.em.fork(),
          container: null,
        }),
      );

      let caught: unknown;
      try {
        await callerB.orchestration.claimRun({
          orgId: DEFAULT_ORG_ID,
          taskId,
          instanceId: "instance-B",
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      // tRPC wraps ClaimConflictError as a TRPCError with code CONFLICT
      expect(String((caught as { message?: unknown }).message ?? caught)).toContain(
        "already claimed",
      );
    } finally {
      await db.close();
    }
  });
});
