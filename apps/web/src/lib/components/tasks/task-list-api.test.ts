import { describe, expect, test } from "bun:test";

import {
  fetchSavedTaskView,
  fetchTaskList,
  savedTaskViewColumns,
  updateTaskListFields,
} from "./task-list-api";

describe("task list web API caller", () => {
  test("loads project tasks through the public task API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, [{ id: "task-1", title: "One" }]);

    await fetchTaskList(fetchFn, { orgId: "org-1", userId: "user-1", projectId: "project-1" });

    expect(calls[0]).toEqual({
      url: "/api/v1/tasks?orgId=org-1&userId=user-1&projectId=project-1",
      init: expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: { "content-type": "application/json" },
      }),
    });
  });

  test("loads saved view display columns from the public saved-view API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, { id: "view-1", displayProperties: { columns: ["title", "status"] } });

    const view = await fetchSavedTaskView(fetchFn, { savedViewId: "view-1" });

    expect(savedTaskViewColumns(view)).toEqual(["title", "status"]);
    expect(calls[0]?.url).toBe("/api/v1/saved-views/view-1");
  });

  test("updates editable table fields through the public task API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, { ok: true });

    await updateTaskListFields(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      taskId: "task-1",
      patch: { status: "in_progress", priority: 3 },
    });

    expect(calls[0]?.url).toBe("/api/v1/tasks/task-1");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      status: "in_progress",
      priority: 3,
    });
  });

  test("rejects missing public API scope before task list calls", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, []);

    await expect(fetchTaskList(fetchFn, { orgId: "org-1", userId: "", projectId: "project-1" }))
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
