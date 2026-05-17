import { describe, expect, mock, spyOn, test } from "bun:test";

import type { RunRef, RetryError } from "@execution-orchestration/infrastructure/agent-runtime/symphony/retry.ts";
import { startSymphonyOrchestrator } from "@execution-orchestration/infrastructure/agent-runtime/symphony/orchestrator.ts";
import {
  scanForStalledRuns,
  startStallScanner,
  type StallScannerHandle,
} from "@execution-orchestration/infrastructure/agent-runtime/symphony/stall.ts";
import type { WorkflowConfig } from "@execution-orchestration/infrastructure/agent-runtime/symphony/schemas.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: WorkflowConfig = {
  stallTimeoutMs: 300_000,
  maxRetryBackoffMs: 300_000,
  keepOnFailure: false,
  maxAttempts: 3,
};

function makeFakeRun(overrides: Partial<{
  id: string;
  orgId: string;
  attemptCount: number;
  orchestrationState: string;
  startedAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "run-1",
    org: { id: overrides.orgId ?? "org-1" },
    attemptCount: overrides.attemptCount ?? 1,
    orchestrationState: overrides.orchestrationState ?? "running",
    startedAt: overrides.startedAt ?? new Date(Date.now() - 600_000), // 10 min ago
  };
}

function makeFakeEm(runs: ReturnType<typeof makeFakeRun>[]) {
  return {
    find: mock(async () => runs),
  };
}

function makeFilteringFakeEm(runs: ReturnType<typeof makeFakeRun>[]) {
  return {
    find: mock(async (_Entity: unknown, options: Record<string, unknown>) => {
      // TypeORM passes { where: { org: { id }, orchestrationState, startedAt: LessThan(cutoff) } }
      const where = (options["where"] ?? options) as Record<string, unknown>;
      const orgWhere = where["org"] as { id: string } | string;
      const orgId = typeof orgWhere === "string" ? orgWhere : orgWhere?.id;
      const startedAt = where["startedAt"] as { _value: Date } | { $lt: Date };
      // TypeORM LessThan stores the value in _value
      const cutoff = "_value" in startedAt ? startedAt._value : startedAt.$lt;
      return runs.filter((run) =>
        run.org.id === orgId &&
        run.orchestrationState === where["orchestrationState"] &&
        run.startedAt.getTime() < cutoff.getTime()
      );
    }),
  };
}

// ---------------------------------------------------------------------------
// scanForStalledRuns
// ---------------------------------------------------------------------------

describe("scanForStalledRuns", () => {
  test("calls onStalled for each stalled run", async () => {
    const run1 = makeFakeRun({ id: "run-1", orgId: "org-1", attemptCount: 1 });
    const run2 = makeFakeRun({ id: "run-2", orgId: "org-1", attemptCount: 2 });
    const fakeEm = makeFakeEm([run1, run2]);
    const onStalled = mock(async () => {});

    const count = await scanForStalledRuns(
      fakeEm as never,
      "org-1",
      DEFAULT_CONFIG,
      onStalled,
    );

    expect(count).toBe(2);
    expect(onStalled).toHaveBeenCalledTimes(2);
  });

  test("passes correct RunRef to onStalled", async () => {
    const run = makeFakeRun({ id: "run-42", orgId: "org-7", attemptCount: 3 });
    const fakeEm = makeFakeEm([run]);
    const captured: Array<[unknown, RunRef, RetryError, unknown]> = [];
    const onStalled = mock(
      async (em: unknown, ref: RunRef, err: RetryError, cfg: unknown) => {
        captured.push([em, ref, err, cfg]);
      },
    );

    await scanForStalledRuns(fakeEm as never, "org-7", DEFAULT_CONFIG, onStalled);

    expect(captured).toHaveLength(1);
    const [, ref, err] = captured[0]!;
    expect(ref.id).toBe("run-42");
    expect(ref.orgId).toBe("org-7");
    expect(ref.attemptCount).toBe(3);
    expect(ref.orchestrationState).toBe("running");
    expect(err.kind).toBe("stall_timeout");
  });

  test("returns 0 when no stalled runs found", async () => {
    const fakeEm = makeFakeEm([]);
    const onStalled = mock(async () => {});

    const count = await scanForStalledRuns(
      fakeEm as never,
      "org-1",
      DEFAULT_CONFIG,
      onStalled,
    );

    expect(count).toBe(0);
    expect(onStalled).not.toHaveBeenCalled();
  });

  test("queries with the correct stall criteria (org + orchestrationState + startedAt filter)", async () => {
    const fakeFind = mock(async () => []);
    const fakeEm = {
      find: fakeFind,
    };

    await scanForStalledRuns(fakeEm as never, "org-5", DEFAULT_CONFIG, mock(async () => {}));

    expect(fakeFind).toHaveBeenCalledTimes(1);
    const [, options] = fakeFind.mock.calls[0]! as unknown as [
      unknown,
      { where: Record<string, unknown> },
    ];
    const where = options.where;
    expect(where["org"]).toEqual({ id: "org-5" });
    expect(where["orchestrationState"]).toBe("running");
    // TypeORM LessThan wraps the value in _value
    const startedAt = where["startedAt"] as { _value: Date };
    expect(startedAt._value).toBeInstanceOf(Date);
    expect(startedAt._value.getTime()).toBeLessThan(Date.now());
  });

  test("passes config and em ref to onStalled", async () => {
    const run = makeFakeRun();
    const fakeEm = makeFakeEm([run]);
    const captured: Array<[unknown, unknown, unknown, unknown]> = [];
    const onStalled = mock(async (em: unknown, ref: unknown, err: unknown, cfg: unknown) => {
      captured.push([em, ref, err, cfg]);
    });

    await scanForStalledRuns(fakeEm as never, "org-1", DEFAULT_CONFIG, onStalled);

    const [passedEm, , , passedCfg] = captured[0]!;
    expect(passedEm).toBe(fakeEm);
    expect(passedCfg).toBe(DEFAULT_CONFIG);
  });

  test("fires within 100ms after run crosses stall_timeout_ms", async () => {
    const startedAt = new Date("2026-05-02T10:00:00.000Z");
    const run = makeFakeRun({ id: "run-crossing", startedAt });
    const fakeEm = makeFilteringFakeEm([run]);
    const onStalled = mock(async () => {});

    const beforeCrossing = new Date(startedAt.getTime() + DEFAULT_CONFIG.stallTimeoutMs - 50);
    const beforeCount = await scanForStalledRuns(
      fakeEm as never,
      "org-1",
      DEFAULT_CONFIG,
      onStalled,
      { now: () => beforeCrossing },
    );

    expect(beforeCount).toBe(0);
    expect(onStalled).not.toHaveBeenCalled();

    const afterCrossing = new Date(startedAt.getTime() + DEFAULT_CONFIG.stallTimeoutMs + 50);
    const afterCount = await scanForStalledRuns(
      fakeEm as never,
      "org-1",
      DEFAULT_CONFIG,
      onStalled,
      { now: () => afterCrossing },
    );

    expect(afterCount).toBe(1);
    expect(onStalled).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// startStallScanner
// ---------------------------------------------------------------------------

describe("startStallScanner", () => {
  test("registers a 30s scanner interval and stops cleanly", async () => {
    const fakeEm = makeFakeEm([]);
    const ticks: Array<() => void> = [];
    const cleared: unknown[] = [];
    const scan = mock(async () => 0);

    const handle = startStallScanner(fakeEm as never, "org-1", DEFAULT_CONFIG, {
      scan,
      setInterval: (fn, ms) => {
        expect(ms).toBe(30_000);
        ticks.push(fn);
        return "timer-1";
      },
      clearInterval: (timer) => {
        cleared.push(timer);
      },
    });

    expect(ticks).toHaveLength(1);
    ticks[0]!();
    await Promise.resolve();
    expect(scan).toHaveBeenCalledTimes(1);

    handle.stop();
    expect(cleared).toEqual(["timer-1"]);
  });

  test("times out a hung scan and allows a later tick to run", async () => {
    const fakeEm = makeFakeEm([]);
    const ticks: Array<() => void> = [];
    const timeouts: Array<() => void> = [];
    const errors: unknown[] = [];
    let scanCount = 0;
    const scan = mock(async () => {
      scanCount += 1;
      if (scanCount === 1) return await new Promise<number>(() => {});
      return 0;
    });

    startStallScanner(fakeEm as never, "org-1", DEFAULT_CONFIG, {
      scan,
      scanTimeoutMs: 50,
      onError: (error) => errors.push(error),
      setInterval: (fn) => {
        ticks.push(fn);
        return "timer-1";
      },
      clearInterval: () => {},
      setTimeout: (fn, ms) => {
        expect(ms).toBe(50);
        timeouts.push(fn);
        return `timeout-${timeouts.length}`;
      },
      clearTimeout: () => {},
    });

    ticks[0]!();
    await Promise.resolve();
    ticks[0]!();
    expect(scan).toHaveBeenCalledTimes(1);

    timeouts[0]!();
    await Promise.resolve();
    expect(errors[0]).toBeInstanceOf(Error);

    ticks[0]!();
    await Promise.resolve();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  test("logs scanner errors when no onError handler is supplied", async () => {
    const fakeEm = makeFakeEm([]);
    const ticks: Array<() => void> = [];
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    try {
      startStallScanner(fakeEm as never, "org-1", DEFAULT_CONFIG, {
        scan: mock(async () => {
          throw new Error("scan failed");
        }),
        setInterval: (fn) => {
          ticks.push(fn);
          return "timer-1";
        },
        clearInterval: () => {},
      });

      ticks[0]!();
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(String(consoleError.mock.calls[0]?.[0])).toContain(
        "fulcrum symphony stall scanner failed",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("startSymphonyOrchestrator", () => {
  test("starts the stall scanner and stops it on shutdown", () => {
    const fakeEm = makeFakeEm([]);
    const starts: unknown[] = [];
    const stops: string[] = [];

    const handle = startSymphonyOrchestrator(
      fakeEm as never,
      "org-1",
      DEFAULT_CONFIG,
      {
        startStallScanner: (...args): StallScannerHandle => {
          starts.push(args);
          return { stop: () => stops.push("stopped") };
        },
      },
    );

    expect(starts).toHaveLength(1);
    handle.stop();
    expect(stops).toEqual(["stopped"]);
  });
});
