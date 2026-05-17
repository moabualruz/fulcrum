import { describe, expect, test } from "bun:test";

import {
  createFieldDependencyRule,
  deleteFieldDependencyRule,
  listFieldDependencyRules,
} from "./field-dependency-api.ts";

describe("field dependency web API helpers", () => {
  test("lists, creates, and deletes rules through Nest public endpoints", async () => {
    const calls: Array<{ body: string | null; method: string; url: string }> = [];
    const fetchFn = responseFetch(calls, [
      [{ id: "rule-1", sourceFieldId: "type", sourceValue: "bug", targetFieldId: "severity", action: "require" }],
      { id: "rule-2", sourceFieldId: "status", sourceValue: "done", targetFieldId: "reviewer", action: "show" },
      { ok: true },
    ]);

    await listFieldDependencyRules(fetchFn, { orgId: "org-1", userId: "user-1", projectId: "project-1" });
    await createFieldDependencyRule(
      fetchFn,
      { orgId: "org-1", userId: "user-1", projectId: "project-1" },
      { sourceFieldId: "status", sourceValue: "done", targetFieldId: "reviewer", action: "show" },
    );
    await deleteFieldDependencyRule(fetchFn, { orgId: "org-1", userId: "user-1" }, "rule-2");

    expect(calls.map(({ method, url }) => [method, url])).toEqual([
      ["GET", "/api/v1/field-dependencies?orgId=org-1&userId=user-1&projectId=project-1"],
      ["POST", "/api/v1/field-dependencies"],
      ["DELETE", "/api/v1/field-dependencies/rule-2?orgId=org-1&userId=user-1"],
    ]);
    expect(JSON.parse(calls[1]!.body ?? "{}")).toEqual({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      sourceFieldId: "status",
      sourceValue: "done",
      targetFieldId: "reviewer",
      action: "show",
    });
  });

  test("requires organization, user, and project scope", async () => {
    await expect(listFieldDependencyRules(responseFetch([], []), { orgId: "org-1", userId: "", projectId: "project-1" }))
      .rejects.toThrow("User scope is required.");
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
