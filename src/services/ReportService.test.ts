/**
 * ReportService tests — TDD for Plan 05-05.
 *
 * Uses in-memory mock EntityManager to avoid DB dependency.
 */

import { describe, it, expect } from "bun:test";
import { ReportService } from "./ReportService.ts";

// ── Mock helpers ───────────────────────────────────────────────────

function makeMetricsCacheRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mc-1",
    projectId: "proj-1",
    date: new Date("2024-01-01"),
    scopeType: "project",
    scopeId: "proj-1",
    orgId: "org-1",
    startedCount: 0,
    completedCount: 0,
    blockedCount: 0,
    pointsCompleted: 0,
    pointsRemaining: 10,
    pointsTotal: 10,
    tasksTotal: 5,
    tasksCompleted: 0,
    wipCount: 2,
    statusCounts: { todo: 3, in_progress: 2, done: 0 },
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    org: { id: "org-1" },
    subjectId: "task-1",
    subjectKind: "task",
    verb: "task.status_changed",
    payload: { field_name: "status", from_value: "todo", to_value: "done" },
    projectId: "proj-1",
    createdAt: new Date("2024-01-05T10:00:00Z"),
    ...overrides,
  };
}

function makeMockEm(findResult: unknown[] = []) {
  return {
    find: async (_entity: unknown, _where: unknown, _opts?: unknown) => findResult,
    findOne: async (_entity: unknown, _where: unknown) => findResult[0] ?? null,
    getConnection: () => ({
      execute: async (_sql: string, _params?: unknown[]) => findResult,
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("ReportService", () => {

  describe("getBurndown", () => {
    it("returns daily {date, remaining, ideal} from MetricsCache", async () => {
      const rows = [
        makeMetricsCacheRow({ date: new Date("2024-01-01"), pointsRemaining: 10, pointsTotal: 10 }),
        makeMetricsCacheRow({ date: new Date("2024-01-02"), pointsRemaining: 8, pointsTotal: 10 }),
        makeMetricsCacheRow({ date: new Date("2024-01-03"), pointsRemaining: 5, pointsTotal: 10 }),
      ];
      const em = makeMockEm(rows);
      const svc = new ReportService(em as never);
      const result = await svc.getBurndown("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-03"),
      });
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ date: expect.any(String), remaining: 10, ideal: expect.any(Number) });
      expect(result[2]!.remaining).toBeLessThanOrEqual(result[0]!.remaining);
    });

    it("includes decreasing ideal burn line", async () => {
      const rows = [
        makeMetricsCacheRow({ date: new Date("2024-01-01"), pointsRemaining: 10, pointsTotal: 10 }),
        makeMetricsCacheRow({ date: new Date("2024-01-04"), pointsRemaining: 5, pointsTotal: 10 }),
      ];
      const em = makeMockEm(rows);
      const svc = new ReportService(em as never);
      const result = await svc.getBurndown("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-04"),
      });
      expect(result[0]!.ideal).toBeGreaterThan(result[result.length - 1]!.ideal);
    });
  });

  describe("getBurnup", () => {
    it("returns daily {date, completed, total} from MetricsCache", async () => {
      const rows = [
        makeMetricsCacheRow({ date: new Date("2024-01-01"), pointsCompleted: 0, pointsTotal: 10 }),
        makeMetricsCacheRow({ date: new Date("2024-01-02"), pointsCompleted: 4, pointsTotal: 10 }),
      ];
      const em = makeMockEm(rows);
      const svc = new ReportService(em as never);
      const result = await svc.getBurnup("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-02"),
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ date: expect.any(String), completed: 0, total: 10 });
      expect(result[1]!.completed).toBe(4);
    });
  });

  describe("getCfd", () => {
    it("returns daily status_counts from MetricsCache", async () => {
      const rows = [
        makeMetricsCacheRow({
          date: new Date("2024-01-01"),
          statusCounts: { todo: 3, in_progress: 2, done: 0 },
        }),
      ];
      const em = makeMockEm(rows);
      const svc = new ReportService(em as never);
      const result = await svc.getCfd("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-01"),
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ date: expect.any(String), statusCounts: expect.any(Object) });
    });
  });

  describe("getWipOverTime", () => {
    it("returns daily WIP from MetricsCache.wipCount", async () => {
      const rows = [
        makeMetricsCacheRow({ date: new Date("2024-01-01"), wipCount: 3 }),
        makeMetricsCacheRow({ date: new Date("2024-01-02"), wipCount: 5 }),
      ];
      const em = makeMockEm(rows);
      const svc = new ReportService(em as never);
      const result = await svc.getWipOverTime("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-02"),
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ date: expect.any(String), wip: 3 });
    });
  });

  describe("workspace scope aggregation (D-53, D-95, HIGH-01)", () => {
    it("when scopeType=workspace, queries with scopeType=workspace", async () => {
      const captured: Array<[unknown, unknown]> = [];
      const mockEm = {
        find: async (entity: unknown, where: unknown) => {
          captured.push([entity, where]);
          return [];
        },
        findOne: async () => null,
        getConnection: () => ({ execute: async () => [] }),
      };
      const svc = new ReportService(mockEm as never);
      await svc.getBurndown("org-1", "workspace", undefined, {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-02"),
      });
      expect(captured.length).toBeGreaterThan(0);
      const [, where] = captured[0]!;
      expect(JSON.stringify(where)).toContain("workspace");
    });

    it("getProgressRollup accepts workspace scope and aggregates", async () => {
      const rows = [
        makeMetricsCacheRow({
          scopeType: "workspace",
          tasksTotal: 20,
          tasksCompleted: 10,
          pointsTotal: 40,
          pointsCompleted: 20,
        }),
      ];
      const em = makeMockEm(rows);
      const svc = new ReportService(em as never);
      const result = await svc.getProgressRollup("org-1", "workspace", undefined);
      expect(result).toMatchObject({
        tasksTotal: expect.any(Number),
        tasksCompleted: expect.any(Number),
        percentByCount: expect.any(Number),
        percentByPoints: expect.any(Number),
      });
    });
  });

  describe("getCycleTime", () => {
    it("computes cycleTimeHours from started→completed events", async () => {
      const events = [
        makeEventRow({
          id: "ev-start",
          subjectId: "task-1",
          verb: "task.status_changed",
          payload: { from_value: "todo", to_value: "in_progress" },
          createdAt: new Date("2024-01-01T08:00:00Z"),
        }),
        makeEventRow({
          id: "ev-done",
          subjectId: "task-1",
          verb: "task.status_changed",
          payload: { from_value: "in_progress", to_value: "done" },
          createdAt: new Date("2024-01-01T16:00:00Z"),
        }),
      ];
      const em = makeMockEm(events);
      const svc = new ReportService(em as never);
      const result = await svc.getCycleTime("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-02"),
      });
      expect(result.length).toBeGreaterThan(0);
      const taskEntry = result.find((r) => r.taskId === "task-1");
      expect(taskEntry).toBeDefined();
      expect(taskEntry!.cycleTimeHours).toBeCloseTo(8, 0);
    });
  });

  describe("getThroughput", () => {
    it("returns weekly completion counts", async () => {
      const events = [
        makeEventRow({ id: "ev-1", subjectId: "task-1", payload: { to_value: "done" }, createdAt: new Date("2024-01-02") }),
        makeEventRow({ id: "ev-2", subjectId: "task-2", payload: { to_value: "done" }, createdAt: new Date("2024-01-03") }),
        makeEventRow({ id: "ev-3", subjectId: "task-3", payload: { to_value: "done" }, createdAt: new Date("2024-01-10") }),
      ];
      const em = makeMockEm(events);
      const svc = new ReportService(em as never);
      const result = await svc.getThroughput("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-14"),
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({ weekStart: expect.any(String), count: expect.any(Number) });
    });
  });

  describe("getVelocity", () => {
    it("returns per-sprint completed and overall average", async () => {
      const rows = [
        makeMetricsCacheRow({ scopeType: "sprint", scopeId: "sprint-1", pointsCompleted: 20, tasksCompleted: 5 }),
        makeMetricsCacheRow({ scopeType: "sprint", scopeId: "sprint-2", pointsCompleted: 30, tasksCompleted: 7 }),
      ];
      const em = makeMockEm(rows);
      const svc = new ReportService(em as never);
      const result = await svc.getVelocity("org-1", "project", "proj-1", 5);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({ sprintId: expect.any(String), completed: expect.any(Number) });
      expect(result[result.length - 1]).toHaveProperty("average");
    });
  });

  describe("getBlockedItems", () => {
    it("returns blocked tasks with days-blocked", async () => {
      const events = [
        makeEventRow({
          id: "ev-blocked",
          subjectId: "task-1",
          verb: "task.status_changed",
          payload: { to_value: "blocked" },
          createdAt: new Date("2024-01-01T00:00:00Z"),
        }),
      ];
      const em = makeMockEm(events);
      const svc = new ReportService(em as never);
      const result = await svc.getBlockedItems("org-1", "project", "proj-1");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({ taskId: expect.any(String), daysBlocked: expect.any(Number) });
    });
  });

  describe("getStaleIssues", () => {
    it("returns tasks with no recent activity past threshold", async () => {
      const events = [
        makeEventRow({ id: "ev-old", subjectId: "task-stale", createdAt: new Date("2023-01-01") }),
      ];
      const em = makeMockEm(events);
      const svc = new ReportService(em as never);
      const result = await svc.getStaleIssues("org-1", "project", "proj-1", 14);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getLeadTime", () => {
    it("returns lead time entries array", async () => {
      const events = [
        makeEventRow({ id: "ev-done", subjectId: "task-1", verb: "task.status_changed", payload: { to_value: "done" }, createdAt: new Date("2024-01-03") }),
      ];
      const em = makeMockEm(events);
      const svc = new ReportService(em as never);
      const result = await svc.getLeadTime("org-1", "project", "proj-1", {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-04"),
      });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getWorkload", () => {
    it("returns per-assignee distribution array", async () => {
      const em = makeMockEm([]);
      const svc = new ReportService(em as never);
      const result = await svc.getWorkload("org-1", "project", "proj-1");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("exportCsv (D-54)", () => {
    it("serializes report data to CSV with headers", () => {
      const svc = new ReportService({} as never);
      const data = [
        { date: "2024-01-01", remaining: 10, ideal: 10 },
        { date: "2024-01-02", remaining: 8, ideal: 8 },
      ];
      const csv = svc.exportCsv("burndown", data);
      expect(typeof csv).toBe("string");
      const lines = csv.trim().split("\n");
      expect(lines[0]).toContain("date");
      expect(lines[0]).toContain("remaining");
      expect(lines.length).toBe(3);
      expect(lines[1]).toContain("2024-01-01");
    });

    it("handles empty data gracefully", () => {
      const svc = new ReportService({} as never);
      const csv = svc.exportCsv("burndown", []);
      expect(typeof csv).toBe("string");
    });
  });

});
