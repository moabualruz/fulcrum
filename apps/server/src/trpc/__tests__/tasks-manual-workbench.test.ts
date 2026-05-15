import { afterEach, describe, expect, mock, test } from "bun:test";
import { Container } from "@needle-di/core";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { __setTaskApplicationForTest } from "@fulcrum/server/trpc/routers/tasks.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";
import type {
  ManualTaskWorkbenchInput,
  ManualTaskWorkbenchOutput,
} from "@work-management/application/manual-task-workbench.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

const buildManualTaskWorkbench = mock(async (): Promise<ManualTaskWorkbenchOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-workbench",
  viewMode: "board",
  layout: "kanban",
  filtersApplied: 2,
  accessSpecifiers: [
    { key: "PUBLIC", i18nLabel: "common.access.public" },
    { key: "PRIVATE", i18nLabel: "common.access.private" },
  ],
  columns: [{
    group: "started",
    label: "Started",
    color: "#f59e0b",
    taskIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    count: 1,
  }],
  listRows: [{
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    traceId: "trace-trpc-workbench",
    projectId: PROJECT_ID,
    title: "Build manual task workbench",
    status: "in_progress",
    stateGroup: "started",
    stateLabel: "Started",
    priority: 3,
    points: 5,
    assigneeId: null,
    labels: ["agent"],
    taskType: "task",
    cycleId: "cycle-foundation",
    moduleId: "module-workbench",
    parentId: null,
    dependencyIds: [],
    updatedAt: "2026-05-13T00:00:00.000Z",
  }],
  table: {
    visibleColumns: [{ key: "title", label: "Title" }],
    rows: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      traceId: "trace-trpc-workbench",
      cells: { title: "Build manual task workbench" },
    }],
  },
  emptyState: {
    allTasksEmpty: false,
    visibleTasksEmpty: false,
    message: "",
  },
}));

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  buildManualTaskWorkbench.mockClear();
});

function caller() {
  restoreApplication = __setTaskApplicationForTest({ buildManualTaskWorkbench });
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(createContext({
    session: {
      id: "session",
      token: "session",
      userId: USER_ID,
      orgId: ORG_ID,
      activeOrganizationId: ORG_ID,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    } as never,
    orgId: ORG_ID,
    userId: USER_ID,
    em: { marker: "trpc-em" } as never,
    container: null,
  }));
}

describe("tasks manual task workbench tRPC", () => {
  test("delegates to shared application action with project, trace, view, and filters", async () => {
    const trpc = caller();

    const result = await trpc.tasks.manualWorkbench({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-workbench",
      viewMode: "board",
      filters: {
        stateGroups: ["started"],
        labels: ["agent"],
      },
      projectCapabilities: { estimateEnabled: false },
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-workbench",
      layout: "kanban",
      filtersApplied: 2,
      listRows: [expect.objectContaining({ title: "Build manual task workbench", traceId: "trace-trpc-workbench" })],
    });
    expect(buildManualTaskWorkbench).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = buildManualTaskWorkbench.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      ManualTaskWorkbenchInput,
    ];
    expect(em).toEqual({ marker: "trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-workbench",
      viewMode: "board",
      filters: {
        stateGroups: ["started"],
        labels: ["agent"],
      },
      projectCapabilities: { estimateEnabled: false },
    });
  });
});
