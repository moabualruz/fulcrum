import { describe, expect, test } from "bun:test";

import {
  type EnqueueLocalJobInput,
  type JobQueueStore,
  type LocalJob,
  rollupJobQueueMetrics,
  runWorkerTick,
} from "./queue.ts";
import { createWorkerRegistry } from "./registry.ts";

describe("local job queue contract", () => {
  test("worker tick runs registered responsibility task and completes traced job", async () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const store = new MemoryJobQueueStore(now);
    const job = await store.enqueue({
      orgId: "org-1",
      projectId: "project-1",
      traceId: "trace-1",
      queue: "notifications",
      kind: "notify.deliver",
      payload: { deliveryId: "delivery-1" },
    });
    const registry = createWorkerRegistry();
    const calls: unknown[] = [];
    registry.registerTask(
      "notify.deliver",
      (payload): asserts payload is { deliveryId: string } => {
        if (!payload || typeof payload !== "object" || typeof (payload as { deliveryId?: unknown }).deliveryId !== "string") {
          throw new Error("deliveryId required");
        }
      },
      async (payload) => {
        calls.push(payload);
      },
    );

    await expect(runWorkerTick({
      queue: "notifications",
      workerId: "worker-a",
      store,
      registry,
      helpers: {},
      now,
    })).resolves.toEqual({
      status: "succeeded",
      jobId: job.id,
      queue: "notifications",
      kind: "notify.deliver",
      traceId: "trace-1",
    });

    expect(calls).toEqual([{ deliveryId: "delivery-1" }]);
    expect(store.get(job.id)?.status).toBe("succeeded");
    expect(store.get(job.id)?.lockedBy).toBeNull();
  });

  test("worker failures requeue with reason until attempts are exhausted", async () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const store = new MemoryJobQueueStore(now);
    const job = await store.enqueue({
      orgId: "org-1",
      traceId: "trace-retry",
      queue: "artifacts",
      kind: "artifact.prune",
      maxAttempts: 2,
    });
    const registry = createWorkerRegistry();
    registry.registerTask("artifact.prune", () => undefined, async () => {
      throw new Error("store unavailable");
    });

    const first = await runWorkerTick({ queue: "artifacts", workerId: "worker-a", store, registry, helpers: {}, now });
    expect(first).toMatchObject({
      status: "retryable-failed",
      jobId: job.id,
      reason: "store unavailable",
      traceId: "trace-retry",
    });
    expect(store.get(job.id)?.status).toBe("queued");
    expect(store.get(job.id)?.lastError).toBe("store unavailable");

    const second = await runWorkerTick({ queue: "artifacts", workerId: "worker-a", store, registry, helpers: {}, now });
    expect(second).toMatchObject({
      status: "terminal-failed",
      jobId: job.id,
      reason: "store unavailable",
      traceId: "trace-retry",
    });
    expect(store.get(job.id)?.status).toBe("failed");
  });

  test("queue metrics report depth, failures, and oldest queued latency", () => {
    const now = new Date("2026-05-18T10:00:00.000Z");
    const metrics = rollupJobQueueMetrics([
      jobRow({ id: "queued-old", queue: "default", status: "queued", createdAt: new Date("2026-05-18T09:59:50.000Z") }),
      jobRow({ id: "queued-retry", queue: "default", status: "queued", attempts: 1, maxAttempts: 3, lastError: "temporary" }),
      jobRow({ id: "running", queue: "default", status: "running" }),
      jobRow({ id: "failed", queue: "default", status: "failed", lastError: "terminal" }),
    ], now);

    expect(metrics).toEqual([{
      queue: "default",
      depth: 2,
      running: 1,
      succeeded: 0,
      failures: 2,
      retryableFailures: 1,
      terminalFailures: 1,
      oldestQueuedLatencyMs: 10_000,
    }]);
  });
});

class MemoryJobQueueStore implements JobQueueStore {
  private readonly jobs = new Map<string, LocalJob>();
  private sequence = 0;

  constructor(private readonly createdAt: Date) {}

  get(id: string): LocalJob | undefined {
    return this.jobs.get(id);
  }

  async enqueue(input: EnqueueLocalJobInput): Promise<LocalJob> {
    const job = jobRow({
      id: `job-${++this.sequence}`,
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      traceId: input.traceId ?? null,
      queue: input.queue,
      kind: input.kind,
      payload: input.payload ?? {},
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ?? this.createdAt,
      createdAt: this.createdAt,
      updatedAt: this.createdAt,
    });
    this.jobs.set(job.id, job);
    return job;
  }

  async claimNext(queue: string, workerId: string, now = this.createdAt): Promise<LocalJob | null> {
    const job = [...this.jobs.values()]
      .filter((candidate) => candidate.queue === queue && candidate.status === "queued" && candidate.availableAt <= now)
      .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!job) return null;
    job.status = "running";
    job.attempts += 1;
    job.lockedBy = workerId;
    job.lockedAt = now;
    job.updatedAt = now;
    return job;
  }

  async complete(jobId: string): Promise<LocalJob | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.status = "succeeded";
    job.lockedBy = null;
    job.lockedAt = null;
    return job;
  }

  async fail(jobId: string, reason: string, options: { retryable: boolean; nextAvailableAt?: Date }): Promise<LocalJob | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.status = options.retryable ? "queued" : "failed";
    job.lockedBy = null;
    job.lockedAt = null;
    job.lastError = reason;
    if (options.nextAvailableAt) job.availableAt = options.nextAvailableAt;
    return job;
  }

  async listForMetrics(queue?: string): Promise<LocalJob[]> {
    return [...this.jobs.values()].filter((job) => !queue || job.queue === queue);
  }
}

function jobRow(overrides: Partial<LocalJob>): LocalJob {
  const now = new Date("2026-05-18T10:00:00.000Z");
  return {
    id: "job-1",
    orgId: "org-1",
    projectId: null,
    traceId: null,
    queue: "default",
    kind: "test",
    payload: {},
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    availableAt: now,
    lockedBy: null,
    lockedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
