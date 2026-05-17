import { describe, expect, test } from "bun:test";

import { fetchTaskActivity } from "./activity-api";

describe("task activity web API caller", () => {
  test("loads task-scoped activity through the public audit API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, {
      data: [{ id: "audit-1", subjectId: "task-1" }],
      total: 1,
    });

    const rows = await fetchTaskActivity(fetchFn, { orgId: "org-1", taskId: "task-1", limit: 25 });

    expect(rows).toEqual([{ id: "audit-1", subjectId: "task-1" }]);
    expect(calls).toEqual([
      {
        url: "/api/v1/audit?orgId=org-1&kind=task&subjectId=task-1&limit=25",
        init: expect.objectContaining({
          method: "GET",
          credentials: "include",
          headers: { "content-type": "application/json" },
        }),
      },
    ]);
  });

  test("rejects missing organization scope before making a request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = responseFetch(calls, { data: [] });

    await expect(fetchTaskActivity(fetchFn, { orgId: "", taskId: "task-1" }))
      .rejects.toThrow("Organization scope is required.");
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
