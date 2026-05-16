/**
 * TDD — claimRun claim-lock: Unclaimed → Claimed with optimistic lock + events row.
 *
 * RED target: services/execution-orchestration/src/infrastructure/agent-runtime/symphony/orchestrator.ts does not exist yet.
 * GREEN target: exactly one of two parallel claimRun calls succeeds; the other
 *   throws ClaimConflictError; events table has exactly one state_changed row.
 *
 * Closes (issue): .scratch/agent-os-vision/03-symphony-orchestration/issues/06-state-machine-claim-lock.md
 */

import { afterAll, describe, expect, it } from "bun:test";
import type { EntityManager } from "typeorm";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { claimRun, ClaimConflictError } from "@execution-orchestration/infrastructure/agent-runtime/symphony/orchestrator.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

const createCaller = t.createCallerFactory(appRouter);

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
  em: EntityManager,
): Promise<{ taskId: string; runId: string }> {
  const org = em.getReference(Org, DEFAULT_ORG_ID);

  const task = em.create(Task, {
    id: "30000000-0000-0000-0000-000000000001",
    org,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  await em.save(task);

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
  await em.save(run);

  return { taskId: task.id, runId: run.id };
}

async function seedDuplicateUnclaimedRuns(
  em: EntityManager,
): Promise<{ taskId: string; runIds: [string, string] }> {
  const org = em.getReference(Org, DEFAULT_ORG_ID);

  const task = em.create(Task, {
    id: "30000000-0000-0000-0000-000000000010",
    org,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  await em.save(task);

  const runInputs = [
    {
      id: "40000000-0000-0000-0000-000000000010",
      createdAt: new Date("2026-05-01T00:01:00.000Z"),
    },
    {
      id: "40000000-0000-0000-0000-000000000011",
      createdAt: new Date("2026-05-01T00:02:00.000Z"),
    },
  ] as const;

  for (const input of runInputs) {
    const run = em.create(AgentRun, {
      id: input.id,
      org,
      task,
      createdAt: input.createdAt,
      startedAt: input.createdAt,
      orchestrationState: "unclaimed",
      attemptCount: 0,
      sandboxMode: "host",
      iterationCount: 0,
    });
    em.persist(run);
  }
  /* flushed */

  return { taskId: task.id, runIds: [runInputs[0].id, runInputs[1].id] };
}

describe("claimRun — claim-lock state machine", () => {
  let lastDb: TestOrm | undefined;

  afterAll(async () => {
    await lastDb?.close();
  });

  it("transitions unclaimed → claimed and emits a state_changed event", async () => {
    lastDb = await createTestOrm();
    const { taskId, runId } = await seedUnclaimedRun(lastDb.em);

    const result = await claimRun(lastDb.em, DEFAULT_ORG_ID, taskId, "instance-A");

    expect(result.runId).toBe(runId);

    // Verify DB state: run is now claimed
    const em = lastDb.em;
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
    const db = await createTestOrm();
    try {
      const { taskId } = await seedUnclaimedRun(db.em);

      // First claim succeeds
      await claimRun(db.em, DEFAULT_ORG_ID, taskId, "instance-A");

      // Second claim on same task → ClaimConflictError
      let caught: unknown;
      try {
        await claimRun(db.em, DEFAULT_ORG_ID, taskId, "instance-B");
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ClaimConflictError);
    } finally {
      await db.close();
    }
  });

  it("claims one duplicate unclaimed run instead of updating the whole task set", async () => {
    const db = await createTestOrm();
    try {
      const { taskId, runIds } = await seedDuplicateUnclaimedRuns(db.em);

      const result = await claimRun(db.em, DEFAULT_ORG_ID, taskId, "instance-A");

      expect(result.runId).toBe(runIds[0]);

      const em = db.em;
      const claimed = await em.find(AgentRun, {
        task: taskId,
        orchestrationState: "claimed",
      } as never);
      const unclaimed = await em.find(AgentRun, {
        task: taskId,
        orchestrationState: "unclaimed",
      } as never);

      expect(claimed.map((run) => run.id)).toEqual([runIds[0]]);
      expect(unclaimed.map((run) => run.id)).toEqual([runIds[1]]);
    } finally {
      await db.close();
    }
  });

  it("rolls back claimed state when state_changed event insert fails", async () => {
    const db = await createTestOrm();
    try {
      const { taskId, runId } = await seedUnclaimedRun(db.em);
      await db.em.getConnection().execute(
        `alter table "events" add constraint "events_reject_state_changed_test" check ("verb" <> 'state_changed')`,
      );

      let caught: unknown;
      try {
        await claimRun(db.em, DEFAULT_ORG_ID, taskId, "instance-A");
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();

      const em = db.em;
      const run = await em.findOneOrFail(AgentRun, { id: runId });
      const events = await em.find(Event, {
        subjectKind: "agent_run",
        subjectId: runId,
        verb: "state_changed",
      });

      expect(run.orchestrationState).toBe("unclaimed");
      expect(events).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("parallel claims: exactly one succeeds, one throws ClaimConflictError; events has exactly one row", async () => {
    const db = await createTestOrm();
    try {
      const { taskId, runId } = await seedUnclaimedRun(db.em);

      const results = await Promise.allSettled([
        claimRun(db.em, DEFAULT_ORG_ID, taskId, "instance-A"),
        claimRun(db.em, DEFAULT_ORG_ID, taskId, "instance-B"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(
        (rejected[0] as PromiseRejectedResult).reason,
      ).toBeInstanceOf(ClaimConflictError);

      // Events table must have exactly one state_changed row after both settle
      const em = db.em;
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
    const db = await createTestOrm();
    try {
      let caught: unknown;
      try {
        await claimRun(
          db.em,
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
    const db = await createTestOrm();
    try {
      const { taskId, runId } = await seedUnclaimedRun(db.em);
      const caller = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-claim-lock-test",
          em: db.em,
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
    const db = await createTestOrm();
    try {
      const { taskId } = await seedUnclaimedRun(db.em);

      const callerA = createCaller(
        createContext({
          session: mockSession() as unknown as import("better-auth").Session,
          orgId: DEFAULT_ORG_ID,
          userId: "user-claim-lock-test",
          em: db.em,
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
          em: db.em,
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
