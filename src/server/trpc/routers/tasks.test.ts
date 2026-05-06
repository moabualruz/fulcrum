import { describe, expect, mock, test } from "bun:test";

import { createContext } from "../../../trpc/context.ts";
import { t } from "../../../trpc/trpc.ts";
import type { AppContext, TaskDto } from "../../../application/tasks/types.ts";
import type * as taskCommandsModule from "../../../application/tasks/commands.ts";
import type * as taskQueriesModule from "../../../application/tasks/queries.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const taskDto: TaskDto = {
  id: TASK_ID,
  orgId: ORG_ID,
  projectId: null,
  title: "Adapter task",
  description: null,
  descriptionText: "",
  tiptapContent: { type: "doc", content: [] },
  status: "todo",
  priority: null,
  points: null,
  assigneeId: null,
  labels: [],
  parentId: null,
  dependencies: { blocks: [], blocked_by: [] },
  createdAt: new Date("2026-05-06T00:00:00.000Z"),
  updatedAt: new Date("2026-05-06T00:00:00.000Z"),
  deletedAt: null,
};

const createTask = mock(async () => taskDto);
const listTasks = mock(async () => [taskDto]);

mock.module("../../../application/tasks/commands.ts", () => ({
  createTask,
  updateTask: mock(async () => taskDto),
  deleteTask: mock(async () => taskDto),
  bulkUpdate: mock(async () => ({ updated: 1 })),
  bulkDelete: mock(async () => ({ deleted: 1 })),
  setParent: mock(async () => taskDto),
  setDependencies: mock(async () => taskDto),
  normalizedUnique: (ids: string[]) => [...new Set(ids)].sort(),
} satisfies Partial<typeof taskCommandsModule>));

mock.module("../../../application/tasks/queries.ts", () => ({
  listTasks,
  getTask: mock(async () => taskDto),
  listChildren: mock(async () => [taskDto]),
} satisfies Partial<typeof taskQueriesModule>));

async function caller() {
  const { tasksRouter } = await import("./tasks.ts");
  const createCaller = t.createCallerFactory(tasksRouter);
  const em = { marker: "adapter-em" } as never;
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
    em,
    container: null,
  }));
}

describe("tasks tRPC adapter", () => {
  test("calls application task commands instead of repositories or services", async () => {
    const trpc = await caller();
    await trpc.create({ title: "Adapter task", status: "todo" });

    expect(createTask).toHaveBeenCalledTimes(1);
    const [, appCtx, input] = createTask.mock.calls[0] as [unknown, AppContext, Record<string, unknown>];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
    expect(input).toMatchObject({ title: "Adapter task", status: "todo" });
  });

  test("calls application task queries instead of repositories or services", async () => {
    const trpc = await caller();
    const rows = await trpc.list();

    expect(rows).toHaveLength(1);
    expect(listTasks).toHaveBeenCalledTimes(1);
    const [, appCtx] = listTasks.mock.calls[0] as [unknown, AppContext];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
  });
});
