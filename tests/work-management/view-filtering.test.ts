import { describe, expect, test } from "bun:test";

import {
  TASK_STATE_GROUP_ORDER,
  TASK_VIEW_ACCESS_SPECIFIERS,
  countTaskViewFilters,
  getCurrentTaskStateSequence,
  orderTaskStateGroups,
  satisfiesTaskDateFilter,
  shouldRenderTaskColumn,
  sortTaskStates,
  type TaskState,
} from "@work-management/application/task-view-filtering.ts";

const now = new Date(2026, 4, 13);

describe("work-management task view/filter behavior", () => {
  test("counts applied filters the way task view badges", () => {
    expect(countTaskViewFilters({
      state: ["started", "completed"],
      priority: ["urgent"],
      labels: [],
      archived: true,
      empty: null,
      search: "ignored",
      includeSubIssues: false,
    })).toBe(4);
    expect(countTaskViewFilters(null)).toBe(0);
  });

  test("evaluates relative and absolute date filters against calendar days", () => {
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 13), "today;custom;custom", now)).toBe(true);
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 12), "yesterday;custom;custom", now)).toBe(true);
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 7), "last_7_days;custom;custom", now)).toBe(true);
    expect(satisfiesTaskDateFilter(new Date(2026, 3, 12), "last_30_days;custom;custom", now)).toBe(false);
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 14), "2026-05-13;after", now)).toBe(true);
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 12), "2026-05-13;before", now)).toBe(true);
  });

  test("keeps from-now date filter behavior for before and after operators", () => {
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 1), "1_weeks;before;fromnow", now)).toBe(true);
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 8), "1_weeks;before;fromnow", now)).toBe(false);
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 28), "2_weeks;after;fromnow", now)).toBe(true);
    expect(satisfiesTaskDateFilter(new Date(2026, 5, 13), "1_months;after;fromnow", now)).toBe(true);
    expect(satisfiesTaskDateFilter(new Date(2026, 4, 13), "unknown;after;fromnow", now)).toBe(false);
  });

  test("orders state groups and states with  backlog to cancelled sequence", () => {
    expect(TASK_STATE_GROUP_ORDER).toEqual(["backlog", "unstarted", "started", "completed", "cancelled"]);
    expect(orderTaskStateGroups({ started: [{ id: "s1" }], cancelled: [{ id: "c1" }] })).toEqual({
      backlog: [],
      unstarted: [],
      started: [{ id: "s1" }],
      completed: [],
      cancelled: [{ id: "c1" }],
    });

    const states: TaskState[] = [
      { id: "done", group: "completed", sequence: 2 },
      { id: "todo-2", group: "unstarted", sequence: 2 },
      { id: "backlog", group: "backlog", sequence: 9 },
      { id: "todo-1", group: "unstarted", sequence: 1 },
      { id: "progress", group: "started", sequence: 1 },
    ];

    expect(sortTaskStates(states)?.map((state) => state.id)).toEqual([
      "backlog",
      "todo-1",
      "todo-2",
      "progress",
      "done",
    ]);
  });

  test("computes drag/drop state sequence values", () => {
    const groupStates: TaskState[] = [
      { id: "a", group: "started", sequence: 100 },
      { id: "b", group: "started", sequence: 200 },
      { id: "c", group: "started", sequence: 300 },
    ];

    expect(getCurrentTaskStateSequence(groupStates, { id: "b", groupKey: "started" }, undefined)).toBe(65535);
    expect(getCurrentTaskStateSequence(groupStates, { id: "a", groupKey: "started" }, "top")).toBe(100 - 65535);
    expect(getCurrentTaskStateSequence(groupStates, { id: "b", groupKey: "started" }, "top")).toBe(150);
    expect(getCurrentTaskStateSequence(groupStates, { id: "b", groupKey: "started" }, "bottom")).toBe(250);
    expect(getCurrentTaskStateSequence(groupStates, { id: "c", groupKey: "started" }, "bottom")).toBe(300 + 65535);
    expect(getCurrentTaskStateSequence([], { id: "missing", groupKey: "started" }, "top")).toBe(65535);
  });

  test("preserves task display and view access helpers without React icons", () => {
    expect(shouldRenderTaskColumn("estimate", { estimateEnabled: false })).toBe(false);
    expect(shouldRenderTaskColumn("estimate", { estimateEnabled: true })).toBe(true);
    expect(shouldRenderTaskColumn("priority", { estimateEnabled: false })).toBe(true);
    expect(TASK_VIEW_ACCESS_SPECIFIERS).toEqual([
      { key: "PUBLIC", i18nLabel: "common.access.public" },
      { key: "PRIVATE", i18nLabel: "common.access.private" },
    ]);
  });
});
