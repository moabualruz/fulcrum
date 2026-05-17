import { describe, expect, test } from "bun:test";

import {
  createAutomationRule,
  deleteAutomationRule,
  listAutomationRules,
  listAutomationTemplates,
  updateAutomationRule,
} from "./automation-api.ts";

describe("automation web API helpers", () => {
  test("routes automation CRUD and templates through Nest public endpoints", async () => {
    const calls: Array<{ body: string | null; method: string; url: string }> = [];
    const fetchFn = responseFetch(calls, [
      [{ id: "auto-1", name: "Auto triage", triggerType: "task_created", actionType: "set_status" }],
      { id: "auto-1", name: "Auto triage", triggerType: "task_created", actionType: "set_status" },
      { id: "auto-1", name: "Auto triage", triggerType: "task_created", actionType: "set_status", enabled: false },
      [{ name: "Close stale tasks", description: "Close stale work", triggerType: "task.stale", actionType: "set_status" }],
      { deleted: true },
    ]);

    await listAutomationRules(fetchFn, { orgId: "org-1", userId: "user-1", projectId: "project-1" });
    await createAutomationRule(fetchFn, { orgId: "org-1", userId: "user-1", projectId: "project-1" }, {
      name: "Auto triage",
      triggerType: "task_created",
      triggerConfig: {},
      actionType: "set_status",
      actionConfig: { status: "todo" },
      condition: null,
    });
    await updateAutomationRule(fetchFn, { orgId: "org-1", userId: "user-1" }, { id: "auto-1", enabled: false });
    await listAutomationTemplates(fetchFn, { orgId: "org-1", userId: "user-1" });
    await deleteAutomationRule(fetchFn, { orgId: "org-1", userId: "user-1" }, { id: "auto-1" });

    expect(calls.map(({ method, url }) => [method, url])).toEqual([
      ["GET", "/api/v1/automations?orgId=org-1&userId=user-1&projectId=project-1"],
      ["POST", "/api/v1/automations"],
      ["PATCH", "/api/v1/automations/auto-1"],
      ["GET", "/api/v1/automations/templates?orgId=org-1&userId=user-1"],
      ["DELETE", "/api/v1/automations/auto-1?orgId=org-1&userId=user-1"],
    ]);
    expect(JSON.parse(calls[1]!.body ?? "{}")).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Auto triage",
    });
  });

  test("requires organization, user, and project scope for list", async () => {
    await expect(listAutomationRules(responseFetch([], []), { orgId: "org-1", userId: "", projectId: "project-1" }))
      .rejects.toThrow("Organization and user scope are required.");
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
