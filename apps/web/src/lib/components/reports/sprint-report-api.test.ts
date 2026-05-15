import { describe, expect, test } from "bun:test";

import { fetchSprintReport } from "./sprint-report-api.ts";

describe("sprint report web API helper", () => {
  test("loads sprint report shell through the Nest sprint endpoint", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const report = await fetchSprintReport(responseFetch(calls, {
      id: "sprint-1",
      name: "Sprint 1",
      status: "active",
      startsAt: "2026-05-01T00:00:00.000Z",
      endsAt: "2026-05-15T00:00:00.000Z",
    }), { orgId: "org-1", sprintId: "sprint-1" });

    expect(calls).toEqual([
      { method: "GET", url: "/api/v1/sprints/sprint-1?orgId=org-1" },
    ]);
    expect(report).toEqual({
      id: "sprint-1",
      name: "Sprint 1",
      status: "active",
      startDate: "2026-05-01T00:00:00.000Z",
      endDate: "2026-05-15T00:00:00.000Z",
      closedSummary: null,
      retrospectiveNotes: null,
      tasks: [],
      velocityHistory: [],
    });
  });

  test("requires organization and sprint scope", async () => {
    await expect(fetchSprintReport(responseFetch([], {}), { orgId: "", sprintId: "sprint-1" }))
      .rejects.toThrow("Organization scope is required.");
  });
});

function responseFetch(calls: unknown[], body: unknown): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(url) });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}
