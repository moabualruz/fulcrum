import { afterEach, describe, expect, test } from "bun:test";

import { createErrorLogsCommand } from "./errorLogs.ts";

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

describe("generated error log commands", () => {
  test("routes error log commands through the Nest error log API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-owner";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      calls.push({ url: String(url), method: init?.method, body: null });
      return Response.json(responseFor(requestUrl.pathname, init?.method ?? "GET"));
    }) as typeof fetch;

    await createErrorLogsCommand().parseAsync([
      "list",
      "--limit",
      "25",
      "--since",
      "2026-05-14T00:00:00.000Z",
      "--json",
    ], { from: "user" });
    await createErrorLogsCommand().parseAsync(["get", "--id", "err-1", "--json"], { from: "user" });
    await createErrorLogsCommand().parseAsync(["clear", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/error-logs?orgId=org-1&userId=user-owner&limit=25&since=2026-05-14T00%3A00%3A00.000Z",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/error-logs/err-1?orgId=org-1&userId=user-owner",
        body: null,
      },
      {
        method: "DELETE",
        url: "http://127.0.0.1:3210/api/v1/error-logs?orgId=org-1&userId=user-owner",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [errorLogRow()],
      errorLogRow(),
      { ok: true, deleted: 1 },
    ]);
  });
});

function responseFor(path: string, method: string): unknown {
  if (path === "/api/v1/error-logs" && method === "GET") return [errorLogRow()];
  if (path === "/api/v1/error-logs/err-1" && method === "GET") return errorLogRow();
  if (path === "/api/v1/error-logs" && method === "DELETE") return { ok: true, deleted: 1 };
  throw new Error(`unexpected request ${method} ${path}`);
}

function errorLogRow() {
  return {
    id: "err-1",
    orgId: "org-1",
    userId: "user-owner",
    occurredAt: "2026-05-14T00:00:00.000Z",
    os: "darwin",
    arch: "arm64",
    bunVersion: "1.3.13",
    fulcrumVersion: "0.1.0",
    recentCliCommand: "fulcrum run",
    recentProcedure: null,
    errorMessage: "boom",
    stackTrace: "stack",
    context: { route: "run" },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
