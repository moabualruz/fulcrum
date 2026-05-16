import { describe, expect, test } from "bun:test";

import {
  exportReportCsv,
  getBlockedItemsReport,
  getBurnupReport,
  getCfdReport,
  getCycleTimeReport,
  getLeadTimeReport,
  getProgressRollupReport,
  getStaleIssuesReport,
  getThroughputReport,
  getVelocityReport,
  getWipOverTimeReport,
} from "@work-management/application/reports/queries.ts";

const ctx = { orgId: "org-1", userId: "user-1" };
const dateRange = {
  start: new Date("2024-01-01T00:00:00.000Z"),
  end: new Date("2024-01-31T00:00:00.000Z"),
};

function metricsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "metrics-1",
    projectId: "project-1",
    date: new Date("2024-01-01T00:00:00.000Z"),
    scopeType: "project",
    scopeId: "project-1",
    pointsCompleted: 3,
    pointsRemaining: 7,
    pointsTotal: 10,
    tasksCompleted: 2,
    tasksTotal: 5,
    statusCounts: { todo: 2, done: 1 },
    wipCount: 4,
    ...overrides,
  };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    org: { id: "org-1" },
    subjectKind: "task",
    subjectId: "task-1",
    projectId: "project-1",
    verb: "task.status_changed",
    payload: { to_value: "done" },
    createdAt: new Date("2024-01-03T12:00:00.000Z"),
    ...overrides,
  };
}

function fakeEm(rows: unknown[]) {
  return {
    find: async () => rows,
    findOne: async () => rows[0] ?? null,
  };
}

describe("application report queries", () => {
  test("maps metrics-backed report wrappers to client-facing shapes", async () => {
    const em = fakeEm([
      metricsRow({ date: new Date("2024-01-01T00:00:00.000Z"), pointsCompleted: 2, pointsRemaining: 8 }),
      metricsRow({ date: new Date("2024-01-02T00:00:00.000Z"), pointsCompleted: 5, pointsRemaining: 5 }),
    ]) as never;

    expect(await getBurnupReport(em, ctx, { scopeType: "project", scopeId: "project-1", dateRange })).toEqual([
      { date: "2024-01-01", completed: 2, total: 10 },
      { date: "2024-01-02", completed: 5, total: 10 },
    ]);
    expect(await getCfdReport(em, ctx, { scopeType: "project", scopeId: "project-1", dateRange })).toEqual([
      { date: "2024-01-01", statusCounts: { todo: 2, done: 1 } },
      { date: "2024-01-02", statusCounts: { todo: 2, done: 1 } },
    ]);
    expect(await getWipOverTimeReport(em, ctx, { scopeType: "project", scopeId: "project-1", dateRange })).toEqual([
      { date: "2024-01-01", wip: 4 },
      { date: "2024-01-02", wip: 4 },
    ]);
    expect(await getVelocityReport(em, ctx, { scopeType: "project", scopeId: "project-1", lastN: 2 })).toEqual([
      { sprintId: "project-1", sprintName: undefined, completed: 2, average: 4 },
      { sprintId: "project-1", sprintName: undefined, completed: 5, average: 4 },
    ]);
    expect(await getProgressRollupReport(em, ctx, { scopeType: "project", scopeId: "project-1" })).toEqual({
      tasksTotal: 10,
      tasksCompleted: 4,
      percentByCount: 40,
      pointsTotal: 20,
      pointsCompleted: 7,
      percentByPoints: 35,
    });
  });

  test("maps event-backed reports and empty workload wrapper", async () => {
    const em = fakeEm([
      eventRow({
        id: "event-start",
        payload: { to_value: "in_progress" },
        createdAt: new Date("2024-01-03T09:00:00.000Z"),
      }),
      eventRow({
        id: "event-done",
        payload: { to_value: "done" },
        createdAt: new Date("2024-01-03T13:00:00.000Z"),
      }),
      eventRow({
        id: "event-blocked",
        subjectId: "task-2",
        payload: { to_value: "blocked" },
        createdAt: new Date("2024-01-04T00:00:00.000Z"),
      }),
    ]) as never;

    expect(await getCycleTimeReport(em, ctx, { scopeType: "project", scopeId: "project-1", dateRange })).toMatchObject([
      { taskId: "task-1", cycleTimeHours: 4 },
    ]);
    expect(await getLeadTimeReport(em, ctx, { scopeType: "project", scopeId: "project-1", dateRange })).toEqual([]);
    expect(await getThroughputReport(em, ctx, { scopeType: "project", scopeId: "project-1", dateRange })).toEqual([
      { weekStart: "2024-01-01", count: 1 },
    ]);
    expect(await getBlockedItemsReport(em, ctx, { scopeType: "project", scopeId: "project-1" })).toMatchObject([
      { taskId: "task-2" },
    ]);
    expect(await getStaleIssuesReport(em, ctx, { scopeType: "project", scopeId: "project-1", thresholdDays: 1 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: "task-1" }),
        expect.objectContaining({ taskId: "task-2" }),
      ]),
    );
  });

  test("exports every report type through the application CSV switch", async () => {
    const em = fakeEm([
      metricsRow({ date: new Date("2024-01-01T00:00:00.000Z"), statusCounts: { "ready,blocked": 1 } }),
    ]) as never;
    const common = {
      scopeType: "project" as const,
      scopeId: "project-1",
      dateRange,
      lastN: 1,
      thresholdDays: 1,
    };

    const reportTypes = [
      "burndown",
      "burnup",
      "velocity",
      "cfd",
      "cycleTime",
      "leadTime",
      "throughput",
      "wipOverTime",
      "workload",
      "blockedItems",
      "staleIssues",
      "progressRollup",
    ] as const;
    const csvByType = new Map<string, string>();
    for (const reportType of reportTypes) {
      csvByType.set(reportType, await exportReportCsv(em, ctx, { ...common, reportType }));
    }

    expect(csvByType.get("burndown")).toContain("date,pointsRemaining,ideal");
    expect(csvByType.get("burnup")).toContain("date,completed,total");
    expect(csvByType.get("velocity")).toContain("sprintId,sprintName,completed,average");
    expect(csvByType.get("cfd")).toContain('"ready,blocked"');
    expect(csvByType.get("wipOverTime")).toContain("date,wip");
    expect(csvByType.get("progressRollup")).toContain("tasksTotal,tasksCompleted,percentByCount");
    expect(csvByType.get("workload")).toBe("");
  });
});
