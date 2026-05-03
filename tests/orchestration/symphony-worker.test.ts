import { describe, expect, mock, test } from "bun:test";

import type { WorkflowConfig } from "../../src/orchestration/symphony/schemas.ts";
import {
  registerSymphonyPollWorker,
  SYMPHONY_POLL_TASK,
} from "../../src/orchestration/symphony/worker.ts";

const DEFAULT_CONFIG: WorkflowConfig = {
  stallTimeoutMs: 300_000,
  maxRetryBackoffMs: 300_000,
  keepOnFailure: false,
  maxAttempts: 3,
};

class FakeWorker {
  readonly tasks = new Map<string, () => Promise<void>>();
  readonly cronTasks: Array<{ name: string; cron: string }> = [];

  addTask(name: string, handler: () => Promise<void>) {
    this.tasks.set(name, handler);
  }

  addCronTask(name: string, cron: string) {
    this.cronTasks.push({ name, cron });
  }
}

describe("registerSymphonyPollWorker", () => {
  test("registers symphony:poll every minute and invokes orchestrator.tick", async () => {
    const worker = new FakeWorker();
    const tick = mock(async () => {});

    registerSymphonyPollWorker(worker, {
      orchestrator: { tick },
      em: {} as never,
      orgId: "org-1",
      config: DEFAULT_CONFIG,
    });

    expect(worker.cronTasks).toEqual([
      { name: SYMPHONY_POLL_TASK, cron: "* * * * *" },
    ]);

    const handler = worker.tasks.get(SYMPHONY_POLL_TASK);
    expect(handler).toBeDefined();
    await handler!();

    expect(tick).toHaveBeenCalledTimes(1);
  });

  test("starts a 30s stall scanner on worker start and stops it on worker stop", () => {
    const worker = new FakeWorker();
    const starts: unknown[] = [];
    const stops: string[] = [];

    const lifecycle = registerSymphonyPollWorker(worker, {
      orchestrator: { tick: mock(async () => {}) },
      em: {} as never,
      orgId: "org-1",
      config: DEFAULT_CONFIG,
      startStallScanner: (...args) => {
        starts.push(args);
        return { stop: () => stops.push("stopped") };
      },
    });

    lifecycle.start();

    expect(starts).toHaveLength(1);
    expect((starts[0] as unknown[])[1]).toBe("org-1");
    expect((starts[0] as unknown[])[2]).toBe(DEFAULT_CONFIG);
    expect((starts[0] as unknown[])[3]).toEqual({ intervalMs: 30_000 });

    lifecycle.stop();
    expect(stops).toEqual(["stopped"]);
  });
});
