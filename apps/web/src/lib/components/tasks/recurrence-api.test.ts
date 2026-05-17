import { describe, expect, test } from "bun:test";

import {
  deleteTaskRecurrenceRule,
  listTaskRecurrenceRules,
  saveTaskRecurrenceRule,
} from "./recurrence-api.ts";

describe("task recurrence web API helpers", () => {
  test("list reads recurrence rules through the Nest public API", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fetchFn = responseFetch(calls, [{
      id: "rule-1",
      triggerType: "schedule",
      cronExpression: "30 9 * * 1,3",
      occurrencesCreated: 2,
    }]);

    const rows = await listTaskRecurrenceRules(fetchFn, { orgId: "org-1", taskId: "task-1" });

    expect(calls).toEqual([{ body: null, method: "GET", url: "/api/v1/recurrence?orgId=org-1&taskId=task-1" }]);
    expect(rows[0]).toMatchObject({
      id: "rule-1",
      mode: "on_schedule",
      daysOfWeek: [1, 3],
      timeOfDay: "09:30",
      occurrenceCount: 2,
    });
  });

  test("save maps schedule form values to the public recurrence contract", async () => {
    const calls: Array<{ body: string | null; method: string; url: string }> = [];
    const fetchFn = responseFetch(calls, { id: "rule-1", triggerType: "schedule", cronExpression: "0 10 * * 2" });

    await saveTaskRecurrenceRule(fetchFn, {
      orgId: "org-1",
      taskId: "task-1",
      mode: "on_schedule",
      daysOfWeek: [2],
      timeOfDay: "10:00",
    });

    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/recurrence" });
    expect(JSON.parse(calls[0]!.body ?? "{}")).toMatchObject({
      orgId: "org-1",
      taskId: "task-1",
      triggerType: "schedule",
      cronExpression: "0 10 * * 2",
    });
  });

  test("delete requires scope and calls the public rule endpoint", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fetchFn = responseFetch(calls, { ok: true });

    await deleteTaskRecurrenceRule(fetchFn, { orgId: "org-1", ruleId: "rule-1" });

    expect(calls).toEqual([{ body: null, method: "DELETE", url: "/api/v1/recurrence/rule-1?orgId=org-1" }]);
    await expect(listTaskRecurrenceRules(fetchFn, { orgId: "", taskId: "task-1" }))
      .rejects.toThrow("Organization scope and task are required.");
  });
});

function responseFetch(calls: unknown[], body: unknown): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(url),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}
