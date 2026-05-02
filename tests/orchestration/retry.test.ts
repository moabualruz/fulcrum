import { describe, expect, mock, test } from "bun:test";

import { calcRetryDelay, scheduleRetry } from "../../src/orchestration/symphony/retry.ts";
import type { WorkflowConfig } from "../../src/orchestration/symphony/schemas.ts";

// ---------------------------------------------------------------------------
// calcRetryDelay — pure function, no mocks needed
// ---------------------------------------------------------------------------

describe("calcRetryDelay", () => {
  test.each([
    [1, 3_600_000, 10_000],
    [2, 3_600_000, 20_000],
    [3, 3_600_000, 40_000],
    [4, 3_600_000, 80_000],
    [10, 3_600_000, 3_600_000], // cap: uncapped would be 5_120_000
    [1, 5_000, 5_000],          // immediate cap when maxMs < first-attempt delay
  ])("attempt=%d maxMs=%d → %dms", (attempt, maxMs, expected) => {
    expect(calcRetryDelay(attempt, maxMs)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// scheduleRetry — mock EntityManager to verify state machine side-effects
// ---------------------------------------------------------------------------

function makeFakeEm(updateCount = 1) {
  const runUpdates: Array<{ where: unknown; update: unknown }> = [];
  const emittedEvents: unknown[] = [];

  const fakeRunRepo = {
    nativeUpdate: mock(async (where: unknown, update: unknown) => {
      runUpdates.push({ where, update });
      return updateCount;
    }),
  };

  const fakeEventsRepo = {
    create: mock((data: unknown) => {
      emittedEvents.push(data);
    }),
  };

  const fakeTx = {
    getRepository: (Entity: { name?: string }) => {
      if (Entity.name === "Event") return fakeEventsRepo;
      return fakeRunRepo;
    },
    getReference: (_Entity: unknown, id: string) => ({ id }),
    flush: mock(async () => {}),
  };

  const fakeEm = {
    fork: () => ({
      transactional: async <T>(cb: (tx: typeof fakeTx) => Promise<T>) =>
        cb(fakeTx),
    }),
  };

  return { fakeEm, fakeTx, runUpdates, emittedEvents };
}

const DEFAULT_CONFIG: WorkflowConfig = {
  stallTimeoutMs: 300_000,
  maxRetryBackoffMs: 3_600_000,
  keepOnFailure: false,
  maxAttempts: 3,
};

describe("scheduleRetry", () => {
  test("transitions run to retry_queued state", async () => {
    const { fakeEm, runUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    expect(runUpdates).toHaveLength(1);
    expect((runUpdates[0]!.update as Record<string, unknown>)["orchestrationState"]).toBe(
      "retry_queued",
    );
  });

  test("increments attemptCount", async () => {
    const { fakeEm, runUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 2, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    expect((runUpdates[0]!.update as Record<string, unknown>)["attemptCount"]).toBe(3);
  });

  test("sets nextRetryAt based on backoff formula", async () => {
    const before = Date.now();
    const { fakeEm, runUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    const nextRetryAt = (runUpdates[0]!.update as Record<string, unknown>)["nextRetryAt"] as Date;
    const expectedDelay = calcRetryDelay(1, DEFAULT_CONFIG.maxRetryBackoffMs);
    expect(nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + expectedDelay);
    // Allow 100ms clock drift
    expect(nextRetryAt.getTime()).toBeLessThan(before + expectedDelay + 100);
  });

  test("sets lastErrorKind from error parameter", async () => {
    const { fakeEm, runUpdates } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "stall_timeout" },
      DEFAULT_CONFIG,
    );

    expect((runUpdates[0]!.update as Record<string, unknown>)["lastErrorKind"]).toBe(
      "stall_timeout",
    );
  });

  test("emits state_changed event row with from/to payload", async () => {
    const { fakeEm, emittedEvents } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0] as Record<string, unknown>;
    expect(event["subjectKind"]).toBe("agent_run");
    expect(event["subjectId"]).toBe("run-1");
    expect(event["verb"]).toBe("state_changed");
    expect(event["payload"]).toEqual({ from: "running", to: "retry_queued" });
  });

  test("transitions to terminal failed when next attempt reaches maxAttempts", async () => {
    const { fakeEm, runUpdates, emittedEvents } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 2, orchestrationState: "running" },
      { kind: "agent_error" },
      { ...DEFAULT_CONFIG, maxAttempts: 3 },
    );

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

  test("does not emit event when state transition loses the race", async () => {
    const { fakeEm, emittedEvents } = makeFakeEm(0);

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    expect(emittedEvents).toHaveLength(0);
  });

  test("flushes the transaction", async () => {
    const { fakeEm, fakeTx } = makeFakeEm();

    await scheduleRetry(
      fakeEm as never,
      { id: "run-1", orgId: "org-1", attemptCount: 0, orchestrationState: "running" },
      { kind: "agent_error" },
      DEFAULT_CONFIG,
    );

    expect(fakeTx.flush).toHaveBeenCalledTimes(1);
  });
});
