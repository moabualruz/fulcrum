import { describe, expect, test } from "bun:test";

import { createQuickTask, findSimilarTasks, listProjectTemplates } from "./quick-create-api";

describe("quick task create web API caller", () => {
  test("finds duplicate candidates by reading project tasks through the public task API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, [
      { id: "task-1", title: "Fix auth regression", projectId: "project-1" },
      { id: "task-2", title: "Write docs", projectId: "project-1" },
    ]);

    const rows = await findSimilarTasks(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      title: "auth",
    });

    expect(rows).toEqual([{ id: "task-1", title: "Fix auth regression", projectId: "project-1" }]);
    expect(calls[0]).toEqual({
      url: "/api/v1/tasks?orgId=org-1&userId=user-1&projectId=project-1",
      init: expect.objectContaining({ method: "GET", credentials: "include" }),
    });
  });

  test("loads templates and creates tasks through public APIs", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, [{ id: "template-1", name: "Bug" }]);

    await listProjectTemplates(fetchFn, { orgId: "org-1", userId: "user-1", projectId: "project-1" });
    await createQuickTask(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      title: "Fix bug",
      status: "todo",
      priority: 3,
      points: 5,
      assigneeId: "user-2",
      description: "Reproduce first",
    });

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["GET", "/api/v1/templates?orgId=org-1&userId=user-1&projectId=project-1"],
      ["POST", "/api/v1/tasks"],
    ]);
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      title: "Fix bug",
      status: "todo",
      description: "Reproduce first",
      descriptionText: "Reproduce first",
      priority: 3,
      points: 5,
      assigneeId: "user-2",
    });
  });

  test("rejects missing org/user scope before making a request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, []);

    await expect(createQuickTask(fetchFn, {
      orgId: "org-1",
      userId: "",
      projectId: "project-1",
      title: "Fix bug",
      status: "todo",
    })).rejects.toThrow("Organization and user scope are required.");
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
