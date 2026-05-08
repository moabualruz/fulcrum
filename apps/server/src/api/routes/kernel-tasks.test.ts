import { afterEach, describe, expect, mock, test } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";

import type { ApiEnv } from "../auth.ts";
import type { AppContext, TaskDto } from "@/application/tasks/types.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const taskDto: TaskDto = {
  id: TASK_ID,
  orgId: ORG_ID,
  projectId: null,
  title: "REST adapter task",
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
  taskType: "task",
  cycleId: null,
  moduleId: null,
  createdAt: new Date("2026-05-06T00:00:00.000Z"),
  updatedAt: new Date("2026-05-06T00:00:00.000Z"),
  deletedAt: null,
};

const createTask = mock(async () => taskDto);
const listTasks = mock(async () => [taskDto]);
let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  createTask.mockClear();
  listTasks.mockClear();
});

async function app() {
  const { __setKernelTaskApplicationForTest, registerKernelTaskRoutes } = await import("./kernel-tasks.ts");
  restoreApplication = __setKernelTaskApplicationForTest({ createTask, listTasks });
  const api = new OpenAPIHono<ApiEnv>();
  api.use("*", async (c, next) => {
    c.set("orgId", ORG_ID);
    c.set("userId", USER_ID);
    c.set("db", { transactional: async () => undefined } as never);
    return next();
  });
  registerKernelTaskRoutes(api);
  return api;
}

describe("kernel task REST adapter", () => {
  test("POST /tasks calls application task command", async () => {
    const api = await app();
    const response = await api.request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "REST adapter task", status: "todo" }),
    });

    expect(response.status).toBe(201);
    expect(createTask).toHaveBeenCalledTimes(1);
    const [, appCtx, input] = createTask.mock.calls[0] as unknown as [unknown, AppContext, Record<string, unknown>];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
    expect(input).toMatchObject({ title: "REST adapter task", status: "todo" });
  });

  test("WR-01 POST /tasks forwards accepted application create fields", async () => {
    const api = await app();
    const tiptapContent = { type: "doc", content: [{ type: "paragraph" }] };
    const response = await api.request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "REST adapter task",
        descriptionText: "Preserved description",
        tiptapContent,
        points: 5,
        assigneeId: USER_ID,
        project_id: "22222222-2222-4222-8222-222222222222",
      }),
    });

    expect(response.status).toBe(201);
    expect(createTask).toHaveBeenCalledTimes(1);
    const [, , input] = createTask.mock.calls[0] as unknown as [unknown, AppContext, Record<string, unknown>];
    expect(input).toMatchObject({
      projectId: "22222222-2222-4222-8222-222222222222",
      descriptionText: "Preserved description",
      tiptapContent,
      points: 5,
      assigneeId: USER_ID,
    });
  });

  test("GET /tasks calls application task query", async () => {
    const api = await app();
    const response = await api.request("/tasks");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([expect.objectContaining({ id: TASK_ID, title: "REST adapter task" })]);
    expect(listTasks).toHaveBeenCalledTimes(1);
    const [, appCtx] = listTasks.mock.calls[0] as unknown as [unknown, AppContext];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
  });
});
