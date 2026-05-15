import { afterEach, describe, expect, test } from "bun:test";

import { createCustomFieldDefsCommand } from "./customFieldDefs.ts";
import { createCustomFieldsCommand } from "./custom_fields.ts";
import { createTaskCustomFieldsCommand } from "./taskCustomFields.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalOrgId = process.env["FULCRUM_ORG_ID"];
const originalUserId = process.env["FULCRUM_USER_ID"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_ORG_ID", originalOrgId);
  restoreEnv("FULCRUM_USER_ID", originalUserId);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated custom field commands", () => {
  test("route definitions and task values through the Nest custom field API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-1";
    const calls: Array<{ url: string; method: string | undefined; body: Record<string, unknown> | null }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      const pathname = new URL(String(url)).pathname;
      calls.push({ url: String(url), method: init?.method, body });
      if (pathname.endsWith("/custom-fields") && init?.method === "GET") {
        return Response.json([{ id: "field-1", slug: "severity", type: "select" }]);
      }
      if (pathname.endsWith("/custom-fields") && init?.method === "POST") {
        return Response.json({ id: "field-created", ...body });
      }
      if (pathname.endsWith("/custom-fields/field-1") && init?.method === "PATCH") {
        return Response.json({ id: "field-1", ...body });
      }
      if (pathname.endsWith("/custom-fields/field-1") && init?.method === "DELETE") return Response.json({ ok: true });
      if (pathname.endsWith("/custom-fields/reorder")) return Response.json({ ok: true });
      if (pathname.endsWith("/task-custom-fields/set")) {
        return Response.json({ taskId: "task-1", customFields: { severity: "critical" } });
      }
      if (pathname.endsWith("/task-custom-fields/clear")) return Response.json({ taskId: "task-1", customFields: {} });
      return Response.json({ ok: true });
    }) as typeof fetch;

    await createCustomFieldsCommand().parseAsync(["list", "--project-id", "project-1", "--json"], { from: "user" });
    await createCustomFieldDefsCommand().parseAsync(["list", "--project-id", "project-1", "--json"], { from: "user" });
    await createCustomFieldsCommand().parseAsync([
      "create",
      "--project-id",
      "project-1",
      "--name",
      "Severity",
      "--field-type",
      "select",
      "--options",
      "minor,critical",
      "--required",
      "--json",
    ], { from: "user" });
    await createCustomFieldsCommand().parseAsync([
      "update",
      "--id",
      "field-1",
      "--name",
      "Severity updated",
      "--sort-order",
      "4",
      "--json",
    ], { from: "user" });
    await createCustomFieldsCommand().parseAsync([
      "reorder",
      "--project-id",
      "project-1",
      "--ordered-ids",
      "field-2,field-1",
      "--json",
    ], { from: "user" });
    await createTaskCustomFieldsCommand().parseAsync([
      "set",
      "--task-id",
      "task-1",
      "--field-def-id",
      "field-1",
      "--value-json",
      "\"critical\"",
      "--json",
    ], { from: "user" });
    await createTaskCustomFieldsCommand().parseAsync([
      "clear",
      "--task-id",
      "task-1",
      "--field-def-id",
      "field-1",
      "--json",
    ], { from: "user" });
    await createCustomFieldsCommand().parseAsync(["delete", "--id", "field-1", "--json"], { from: "user" });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/custom-fields?orgId=org-1&userId=user-1&projectId=project-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/custom-fields?orgId=org-1&userId=user-1&projectId=project-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/custom-fields"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/custom-fields/field-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/custom-fields/reorder"],
      ["POST", "http://127.0.0.1:3210/api/v1/task-custom-fields/set"],
      ["POST", "http://127.0.0.1:3210/api/v1/task-custom-fields/clear"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/custom-fields/field-1?orgId=org-1&userId=user-1"],
    ]);
    expect(calls[2]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Severity",
      type: "select",
      required: true,
      configJson: { options: ["minor", "critical"] },
    });
    expect(calls[5]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      taskId: "task-1",
      fieldDefId: "field-1",
      value: "critical",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "field-1", slug: "severity", type: "select" }],
      [{ id: "field-1", slug: "severity", type: "select" }],
      expect.objectContaining({ id: "field-created", name: "Severity" }),
      expect.objectContaining({ id: "field-1", name: "Severity updated" }),
      { ok: true },
      { taskId: "task-1", customFields: { severity: "critical" } },
      { taskId: "task-1", customFields: {} },
      { ok: true },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
