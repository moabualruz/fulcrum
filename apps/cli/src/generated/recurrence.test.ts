import { afterEach, describe, expect, test } from "bun:test";

import { createRecurrenceCommand } from "./recurrence.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalOrgId = process.env["FULCRUM_ORG_ID"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_ORG_ID", originalOrgId);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated recurrence commands", () => {
  test("routes recurrence commands through the Nest recurrence API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
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

    await createRecurrenceCommand().parseAsync(["list", "--task-id", "task-1", "--json"], { from: "user" });
    await createRecurrenceCommand().parseAsync([
      "create",
      "--task-id",
      "task-1",
      "--trigger-type",
      "schedule",
      "--interval-days",
      "3",
      "--max-occurrences",
      "4",
      "--include-subtasks",
      "--timezone",
      "UTC",
      "--json",
    ], { from: "user" });
    await createRecurrenceCommand().parseAsync(["delete", "--rule-id", "rule-1", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/recurrence?orgId=org-1&taskId=task-1",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/recurrence",
        body: {
          orgId: "org-1",
          taskId: "task-1",
          triggerType: "schedule",
          intervalDays: 3,
          maxOccurrences: 4,
          includeSubtasks: true,
          timezone: "UTC",
        },
      },
      {
        method: "DELETE",
        url: "http://127.0.0.1:3210/api/v1/recurrence/rule-1?orgId=org-1",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [recurrenceRule()],
      recurrenceRule(),
      { ok: true },
    ]);
  });
});

function responseFor(path: string, method: string): unknown {
  if (path === "/api/v1/recurrence" && method === "GET") return [recurrenceRule()];
  if (path === "/api/v1/recurrence" && method === "POST") return recurrenceRule();
  if (path === "/api/v1/recurrence/rule-1" && method === "DELETE") return { ok: true };
  throw new Error(`unexpected request ${method} ${path}`);
}

function recurrenceRule() {
  return {
    id: "rule-1",
    orgId: "org-1",
    sourceTaskId: "task-1",
    triggerType: "schedule",
    cronExpression: null,
    intervalDays: 3,
    timezone: "UTC",
    includeSubtasks: true,
    enabled: true,
    occurrencesCreated: 0,
    nextRunAt: "2026-05-17T00:00:00.000Z",
    lastRunAt: null,
    maxOccurrences: 4,
    createdAt: "2026-05-14T00:00:00.000Z",
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
