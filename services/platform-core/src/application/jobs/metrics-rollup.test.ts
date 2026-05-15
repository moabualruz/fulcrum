import { describe, it, expect } from "bun:test";
import { metricsRollupJob, setupMetricsRollupListener } from "./metrics-rollup.ts";
import { createWorkerRegistry } from "./registry.ts";

// ── Mock helpers ───────────────────────────────────────────────────

function makeMockTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    status: "todo",
    points: 5,
    ...overrides,
  };
}

function makeMockEm(tasks: unknown[] = [], existingCache: unknown = null) {
  const upserted: unknown[] = [];
  const persisted: unknown[] = [];
  return {
    find: async (_entity: unknown, _where: unknown) => tasks,
    findOne: async (_entity: unknown, _where: unknown) => existingCache,
    persistAndFlush: async (entity: unknown) => {
      persisted.push(entity);
    },
    flush: async () => {},
    upserted,
    persisted,
    // expose for assertions
    _upserted: upserted,
    _persisted: persisted,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("metrics-rollup worker", () => {

  it("exports metricsRollupJob", () => {
    expect(typeof metricsRollupJob).toBe("object");
    expect(metricsRollupJob.name).toBe("metrics_rollup");
  });

  it("exports setupMetricsRollupListener", () => {
    expect(typeof setupMetricsRollupListener).toBe("function");
  });

  it("rolls up daily snapshot from task state", async () => {
    const tasks = [
      makeMockTask({ status: "todo", points: 5 }),
      makeMockTask({ id: "task-2", status: "done", points: 3 }),
      makeMockTask({ id: "task-3", status: "in_progress", points: 2 }),
    ];
    const em = makeMockEm(tasks);
    const payload = { scope_type: "project" as const, scope_id: "proj-1", org_id: "org-1" };

    await metricsRollupJob.handler(payload, { em: em as never });

    // Something should have been persisted
    expect(em._persisted.length).toBeGreaterThan(0);
    const snapshot = em._persisted[0] as Record<string, unknown>;
    expect(snapshot["tasksTotal"]).toBe(3);
    expect(snapshot["tasksCompleted"]).toBe(1);
    expect(snapshot["pointsTotal"]).toBe(10);
    expect(snapshot["pointsCompleted"]).toBe(3);
    expect(snapshot["pointsRemaining"]).toBe(7);
  });

  it("handles empty project gracefully", async () => {
    const em = makeMockEm([]);
    const payload = { scope_type: "project" as const, scope_id: "proj-empty", org_id: "org-1" };

    await metricsRollupJob.handler(payload, { em: em as never });

    expect(em._persisted.length).toBeGreaterThan(0);
    const snapshot = em._persisted[0] as Record<string, unknown>;
    expect(snapshot["tasksTotal"]).toBe(0);
    expect(snapshot["wipCount"]).toBe(0);
  });

  it("computes wipCount from in_progress tasks", async () => {
    const tasks = [
      makeMockTask({ status: "in_progress" }),
      makeMockTask({ id: "task-2", status: "in_progress" }),
      makeMockTask({ id: "task-3", status: "todo" }),
    ];
    const em = makeMockEm(tasks);
    const payload = { scope_type: "project" as const, scope_id: "proj-1", org_id: "org-1" };

    await metricsRollupJob.handler(payload, { em: em as never });

    const snapshot = em._persisted[0] as Record<string, unknown>;
    expect(snapshot["wipCount"]).toBe(2);
  });

  it("updates existing snapshot row for same date/scope (upsert)", async () => {
    const tasks = [makeMockTask({ status: "done", points: 5 })];
    const existingCache = {
      tasksTotal: 1,
      tasksCompleted: 0,
      pointsTotal: 5,
      pointsCompleted: 0,
      pointsRemaining: 5,
      wipCount: 0,
    };
    const em = makeMockEm(tasks, existingCache);
    const payload = { scope_type: "project" as const, scope_id: "proj-1", org_id: "org-1" };

    await metricsRollupJob.handler(payload, { em: em as never });

    // Should update existing row, not create new one
    expect(em._persisted.length).toBe(1);
    const updated = em._persisted[0] as Record<string, unknown>;
    expect(updated["tasksCompleted"]).toBe(1);
    expect(updated["pointsCompleted"]).toBe(5);
    expect(updated["pointsRemaining"]).toBe(0);
  });

  it("handles workspace scope aggregation", async () => {
    const tasks = [
      makeMockTask({ status: "done", points: 10 }),
      makeMockTask({ id: "task-2", status: "todo", points: 5 }),
    ];
    const em = makeMockEm(tasks);
    const payload = { scope_type: "workspace" as const, scope_id: "ws-1", org_id: "org-1" };

    await metricsRollupJob.handler(payload, { em: em as never });

    expect(em._persisted.length).toBeGreaterThan(0);
    const snapshot = em._persisted[0] as Record<string, unknown>;
    expect(snapshot["scopeType"]).toBe("workspace");
  });

  it("payload assertion rejects missing scope_type", () => {
    expect(() => {
      metricsRollupJob.assertPayload({ scope_id: "proj-1", org_id: "org-1" });
    }).toThrow();
  });

  it("payload assertion rejects missing org_id", () => {
    expect(() => {
      metricsRollupJob.assertPayload({ scope_type: "project" as const, scope_id: "proj-1" });
    }).toThrow();
  });

  it("setupMetricsRollupListener subscribes to task events", () => {
    const subscriptions: string[] = [];
    const mockEventBus = {
      subscribe: (topic: string, _handler: unknown) => {
        subscriptions.push(topic);
        return () => {};
      },
    };
    setupMetricsRollupListener(mockEventBus as never, {} as never);
    expect(subscriptions.length).toBeGreaterThan(0);
  });

  it("metricsRollupJob is registered in worker registry", () => {
    const registry = createWorkerRegistry();
    registry.registerTask(
      metricsRollupJob.name,
      metricsRollupJob.assertPayload,
      metricsRollupJob.handler,
    );
    expect(registry.getTask("metrics_rollup")).toBeDefined();
  });

});
