import { describe, expect, test } from "bun:test";

import {
  fetchDefaultWorkflowTransitions,
  fetchWorkflowTransitions,
  saveWorkflowTransitions,
} from "./workflow-settings-api.ts";

describe("workflow settings web API helpers", () => {
  test("loads, saves, and resets transitions through Nest public endpoints", async () => {
    const calls: Array<{ body: string | null; method: string; url: string }> = [];
    const fetchFn = responseFetch(calls, [
      { transitions: { todo: ["done"] } },
      { transitions: { todo: ["review"] } },
      { transitions: { Backlog: ["Todo"] } },
    ]);

    await fetchWorkflowTransitions(fetchFn, { orgId: "org-1", projectId: "project-1" });
    await saveWorkflowTransitions(fetchFn, { orgId: "org-1", projectId: "project-1" }, { todo: ["review"] });
    await fetchDefaultWorkflowTransitions(fetchFn, "scrum");

    expect(calls.map(({ method, url }) => [method, url])).toEqual([
      ["POST", "/api/v1/workflows/transitions/get"],
      ["POST", "/api/v1/workflows/transitions/update"],
      ["POST", "/api/v1/workflows/default"],
    ]);
    expect(JSON.parse(calls[0]!.body ?? "{}")).toEqual({ orgId: "org-1", projectId: "project-1" });
    expect(JSON.parse(calls[1]!.body ?? "{}")).toEqual({
      orgId: "org-1",
      projectId: "project-1",
      transitions: { todo: ["review"] },
    });
  });

  test("requires organization and project scope", async () => {
    await expect(fetchWorkflowTransitions(responseFetch([], []), { orgId: "", projectId: "project-1" }))
      .rejects.toThrow("Organization and project scope are required.");
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
