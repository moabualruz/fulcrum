import { describe, expect, test } from "bun:test";

import {
  assignTaskToSprint,
  fetchSprintPlanningState,
  listProjectSprints,
} from "./sprint-planning-api.ts";

describe("sprint planning web API helpers", () => {
  test("lists, reads, and assigns through Nest sprint public endpoints", async () => {
    const calls: Array<{ body: string | null; method: string; url: string }> = [];
    const fetchFn = responseFetch(calls, [
      { data: [{ id: "sprint-1", name: "Sprint 1" }] },
      { id: "sprint-1", name: "Sprint 1", capacityPoints: 10, assignedPoints: 3 },
      { id: "assignment-1" },
    ]);

    await listProjectSprints(fetchFn, { orgId: "org-1", projectId: "project-1" });
    const sprint = await fetchSprintPlanningState(fetchFn, { orgId: "org-1", sprintId: "sprint-1" });
    await assignTaskToSprint(fetchFn, { orgId: "org-1", sprintId: "sprint-1", taskId: "task-1" });

    expect(sprint).toMatchObject({ id: "sprint-1", capacityPoints: 10, assignedPoints: 3 });
    expect(calls.map(({ method, url }) => [method, url])).toEqual([
      ["GET", "/api/v1/sprints?orgId=org-1&projectId=project-1"],
      ["GET", "/api/v1/sprints/sprint-1?orgId=org-1"],
      ["POST", "/api/v1/sprints/sprint-1/tasks"],
    ]);
    expect(JSON.parse(calls[2]!.body ?? "{}")).toEqual({ orgId: "org-1", taskId: "task-1" });
  });

  test("requires scope", async () => {
    await expect(listProjectSprints(responseFetch([], []), { orgId: "", projectId: "project-1" }))
      .rejects.toThrow("Organization scope is required.");
  });
});

function responseFetch(calls: unknown[], bodies: unknown[]): typeof fetch {
  let index = 0;
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(url),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const body = bodies[Math.min(index, bodies.length - 1)];
    index += 1;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}
