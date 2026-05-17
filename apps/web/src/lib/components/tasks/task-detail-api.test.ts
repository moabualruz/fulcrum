import { describe, expect, test } from "bun:test";

import {
  archiveTaskDetail,
  fetchTaskChildren,
  fetchTaskDetail,
  fetchTaskRelationships,
  updateTaskTitle,
} from "./task-detail-api";

describe("task detail web API caller", () => {
  test("loads task details and children through the public task API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, { id: "task-1" });

    await fetchTaskDetail(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      projectId: "project-1",
    });
    await fetchTaskChildren(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      projectId: "project-1",
    });

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["GET", "/api/v1/tasks/task-1?orgId=org-1&userId=user-1&projectId=project-1"],
      ["GET", "/api/v1/tasks/task-1/children?orgId=org-1&userId=user-1&projectId=project-1"],
    ]);
  });

  test("updates and archives through public task endpoints", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, { ok: true });

    await updateTaskTitle(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      projectId: "project-1",
      title: "Renamed",
    });
    await archiveTaskDetail(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      projectId: "project-1",
    });

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["PATCH", "/api/v1/tasks/task-1"],
      ["DELETE", "/api/v1/tasks/task-1?orgId=org-1&userId=user-1&projectId=project-1"],
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      title: "Renamed",
    });
  });

  test("loads relationships through the public relationship API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, [{ id: "rel-1" }]);

    await fetchTaskRelationships(fetchFn, { orgId: "org-1", taskId: "task-1" });

    expect(calls).toEqual([
      {
        url: "/api/v1/relationships/list-for-task",
        init: expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orgId: "org-1", taskId: "task-1" }),
        }),
      },
    ]);
  });

  test("rejects missing org/user scope before task requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, []);

    await expect(fetchTaskDetail(fetchFn, { orgId: "org-1", userId: "", taskId: "task-1" }))
      .rejects.toThrow("Organization and user scope are required.");
    expect(calls).toHaveLength(0);
  });
});

function responseFetch(
  calls: Array<{ url: string; init: RequestInit }>,
  body: unknown,
): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}
