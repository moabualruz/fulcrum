import { afterEach, describe, expect, test } from "bun:test";

import { createAutomationsCommand } from "./automations.ts";

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

describe("generated automation commands", () => {
  test("routes automation CRUD and templates through the Nest automation API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const requestUrl = new URL(String(url));
      calls.push({ url: String(url), method: init?.method, body });
      return Response.json(responseFor(requestUrl.pathname, init?.method ?? "GET"));
    }) as typeof fetch;

    await createAutomationsCommand().parseAsync(["list", "--project-id", "project-1", "--json"], { from: "user" });
    await createAutomationsCommand().parseAsync([
      "create",
      "--project-id",
      "project-1",
      "--name",
      "Auto triage",
      "--trigger-type",
      "task.created",
      "--trigger-config-json",
      "{\"inheritance\":{\"scope\":\"descendants\"}}",
      "--condition-field",
      "priority",
      "--condition-operator",
      "equals",
      "--condition-value",
      "high",
      "--action-type",
      "set_status",
      "--action-config-json",
      "{\"status\":\"triage\"}",
      "--json",
    ], { from: "user" });
    await createAutomationsCommand().parseAsync([
      "update",
      "--id",
      "auto-1",
      "--name",
      "Auto triage updated",
      "--disabled",
      "--json",
    ], { from: "user" });
    await createAutomationsCommand().parseAsync(["templates", "--json"], { from: "user" });
    await createAutomationsCommand().parseAsync(["delete", "--id", "auto-1", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/automations?orgId=org-1&userId=user-1&projectId=project-1",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/automations",
        body: {
          orgId: "org-1",
          userId: "user-1",
          projectId: "project-1",
          name: "Auto triage",
          triggerType: "task.created",
          triggerConfig: { inheritance: { scope: "descendants" } },
          condition: { field: "priority", operator: "equals", value: "high" },
          actionType: "set_status",
          actionConfig: { status: "triage" },
        },
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/automations/auto-1",
        body: {
          orgId: "org-1",
          userId: "user-1",
          name: "Auto triage updated",
          enabled: false,
        },
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/automations/templates?orgId=org-1&userId=user-1",
        body: null,
      },
      {
        method: "DELETE",
        url: "http://127.0.0.1:3210/api/v1/automations/auto-1?orgId=org-1&userId=user-1",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "auto-1", name: "Auto triage" }],
      { id: "auto-1", name: "Auto triage" },
      { id: "auto-1", name: "Auto triage updated", enabled: false },
      [{ name: "Close stale tasks" }],
      { deleted: true },
    ]);
  });
});

function responseFor(path: string, method: string): unknown {
  if (path === "/api/v1/automations" && method === "GET") return [{ id: "auto-1", name: "Auto triage" }];
  if (path === "/api/v1/automations" && method === "POST") return { id: "auto-1", name: "Auto triage" };
  if (path === "/api/v1/automations/auto-1" && method === "PATCH") {
    return { id: "auto-1", name: "Auto triage updated", enabled: false };
  }
  if (path === "/api/v1/automations/templates") return [{ name: "Close stale tasks" }];
  if (path === "/api/v1/automations/auto-1" && method === "DELETE") return { deleted: true };
  throw new Error(`unexpected request ${method} ${path}`);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
