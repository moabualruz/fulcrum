import { describe, expect, test } from "bun:test";

import {
  createTaskComment,
  fetchOrganizationMembers,
  fetchTaskThreadedComments,
  subscribeToTaskComments,
} from "./comment-api";

describe("task comment web API caller", () => {
  test("lists threaded comments through the public comments API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, [{ id: "comment-1" }]);

    const result = await fetchTaskThreadedComments(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
    });

    expect(result).toEqual([{ id: "comment-1" }]);
    expect(calls).toEqual([
      {
        url: "/api/v1/comments/threaded",
        init: expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orgId: "org-1", userId: "user-1", taskId: "task-1" }),
        }),
      },
    ]);
  });

  test("creates and subscribes with the same explicit org/user scope", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, { ok: true });
    const body = { type: "doc", content: [{ type: "paragraph" }] };

    await createTaskComment(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      body,
      parentCommentId: "parent-1",
    });
    await subscribeToTaskComments(fetchFn, {
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
    });

    expect(calls.map((call) => call.url)).toEqual([
      "/api/v1/comments/create",
      "/api/v1/comments/subscribe",
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      body,
      parentCommentId: "parent-1",
    });
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
    });
  });

  test("lists mention users through the organization public API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, [{ id: "member-1", userId: "alice" }]);

    await fetchOrganizationMembers(fetchFn, { orgId: "org-1", userId: "user-1" });

    expect(calls[0]).toEqual({
      url: "/api/v1/organizations/members?orgId=org-1&userId=user-1",
      init: expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: { "content-type": "application/json" },
      }),
    });
  });

  test("rejects missing public API scope before making a request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, []);

    await expect(fetchTaskThreadedComments(fetchFn, { orgId: "", userId: "user-1", taskId: "task-1" }))
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
