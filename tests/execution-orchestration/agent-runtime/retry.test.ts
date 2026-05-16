import { describe, expect, mock, test } from "bun:test";

import { calcRetryDelay, scheduleRetry } from "@execution-orchestration/infrastructure/agent-runtime/symphony/retry.ts";
import type { WorkflowConfig } from "@execution-orchestration/infrastructure/agent-runtime/symphony/schemas.ts";

// ---------------------------------------------------------------------------
// calcRetryDelay — pure function, no mocks needed
// ---------------------------------------------------------------------------

describe("calcRetryDelay", () => {
  test.each([
    [1, 3_600_000, 10_000],
    [2, 3_600_000, 20_000],
    [3, 3_600_000, 40_000],
    [4, 3_600_000, 80_000],
    [10, 300_000, 300_000],     // compatibility default cap
    [10, 3_600_000, 3_600_000], // explicit override cap
    [1, 5_000, 5_000],          // immediate cap when maxMs < first-attempt delay
  ])("attempt=%d maxMs=%d → %dms", (attempt, maxMs, expected) => {
    expect(calcRetryDelay(attempt, maxMs)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// scheduleRetry — mock EntityManager to verify state machine side-effects
// ---------------------------------------------------------------------------

function makeFakeEm(updateCount = 1) {
  const queryLog: Array<{ sql: string; params: unknown[] }> = [];
  const emittedEvents: unknown[] = [];

  // transitionRunForRetry calls em.query(sql, params) then em.save(Event, {...})
  const fakeEm = {
    query: mock(async (sql: string, params?: unknown[]) => {
      queryLog.push({ sql, params: params ?? [] });
      // Simulate affected row count (TypeORM raw query returns result array)
      return updateCount > 0 ? [{}] : [];
    }),
    save: mock(async (_Entity: unknown, data: unknown) => {
      emittedEvents.push(data);
      return data;
    }),
  };

  // Derive structured update info from the raw SQL for assertion convenience
  function getRunUpdates(): Array<{ update: Record<string, unknown> }> {
    return queryLog
      .filter((q) => q.sql.startsWith("UPDATE"))
      .map((q) => {
        const update: Record<string, unknown> = {};
        // Parse positional params from the UPDATE SET clause
        // sql shape: UPDATE agent_runs SET orchestration_state = $1, attempt_count = $2, next_retry_at = $3, last_error_kind = $4 [, status = $5] WHERE id = $N AND orchestration_state = $N+1
        const params = q.params;
        update["orchestrationState"] = params[0];
        update["attemptCount"] = params[1];
        update["nextRetryAt"] = params[2];
        update["lastErrorKind"] = params[3];
        // If exhausted, status is param[4]
        if (q.sql.includes("status =")) {
          update["status"] = params[4];
        }
        return { update };
      });
  }

  return { fakeEm, queryLog, emittedEvents, getRunUpdates };
}

const DEFAULT_CONFIG: WorkflowConfig = {
  stallTimeoutMs: 300_000,
  maxRetryBackoffMs: 300_000,
  keepOnFailure: false,
  maxAttempts: 3,
};

describe("scheduleRetry", () => {
  test("transitions run to retry_queued state", async () => {
    const { fakeEm, getRunUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    const runUpdates = getRunUpdates();
    expect(runUpdates).toHaveLength(1);
    expect(runUpdates[0]!.update["orchestrationState"]).toBe("retry_queued");
  });

  test("increments attemptCount", async () => {
    const { fakeEm, getRunUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 2, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    const runUpdates = getRunUpdates();
    expect(runUpdates[0]!.update["attemptCount"]).toBe(3);
  });

  test("sets nextRetryAt based on backoff formula", async () => {
    const before = Date.now();
    const { fakeEm, getRunUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    const runUpdates = getRunUpdates();
    const nextRetryAt = runUpdates[0]!.update["nextRetryAt"] as Date;
    const expectedDelay = calcRetryDelay(1, DEFAULT_CONFIG.maxRetryBackoffMs);
    expect(nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + expectedDelay);
    // Allow 100ms clock drift
    expect(nextRetryAt.getTime()).toBeLessThan(before + expectedDelay + 100);
  });

  test("sets lastErrorKind from error parameter", async () => {
    const { fakeEm, getRunUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "stall_timeout" },
      DEFAULT_CONFIG,
    );

    const runUpdates = getRunUpdates();
    expect(runUpdates[0]!.update["lastErrorKind"]).toBe("stall_timeout");
  });

  test("emits state_changed event row with from/to payload", async () => {
    const { fakeEm, emittedEvents } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    // em.save(Event, data) pushes data to emittedEvents
    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0] as Record<string, unknown>;
    expect(event["subjectKind"]).toBe("agent_run");
    expect(event["subjectId"]).toBe("run-1");
    expect(event["verb"]).toBe("state_changed");
    expect(event["payload"]).toEqual({ from: "running", to: "retry_queued" });
  });

  test("transitions to terminal failed when next attempt reaches maxAttempts", async () => {
    const { fakeEm, getRunUpdates, emittedEvents } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 2, orchestrationState: "running" },
      { kind: "agent_error" },
      { ...DEFAULT_CONFIG, maxAttempts: 3 },
    );

    const runUpdates = getRunUpdates();
    expect(runUpdates).toHaveLength(1);
    expect(runUpdates[0]!.update).toMatchObject({
      orchestrationState: "failed",
      status: "failed",
      attemptCount: 3,
      nextRetryAt: null,
      lastErrorKind: "agent_error",
    });
    expect((emittedEvents[0] as Record<string, unknown>)["payload"]).toEqual({
      from: "running",
      to: "failed",
    });
  });

  test("still emits event even when UPDATE affects zero rows (race condition)", async () => {
    // After migration to raw SQL, transitionRunForRetry unconditionally emits
    // the event — race-condition dedup is handled at the DB constraint level.
    const { fakeEm, emittedEvents } = makeFakeEm(0);

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    expect(emittedEvents).toHaveLength(1);
  });

  test("issues both query and save calls", async () => {
    const { fakeEm } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    // transitionRunForRetry issues em.query() for UPDATE then em.save() for Event
    expect(fakeEm.query).toHaveBeenCalledTimes(1);
    expect(fakeEm.save).toHaveBeenCalledTimes(1);
  });
});
