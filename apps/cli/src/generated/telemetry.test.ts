import { afterEach, describe, expect, test } from "bun:test";

import { createTelemetryCommand } from "./telemetry.ts";

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

describe("generated telemetry commands", () => {
  test("routes telemetry commands through the Nest telemetry API", async () => {
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

    await createTelemetryCommand().parseAsync(["status", "--json"], { from: "user" });
    await createTelemetryCommand().parseAsync(["opt-in", "--json"], { from: "user" });
    await createTelemetryCommand().parseAsync(["opt-out", "--json"], { from: "user" });
    await createTelemetryCommand().parseAsync(["purge", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/telemetry/status?orgId=org-1&userId=user-1",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/telemetry/opt-in",
        body: { orgId: "org-1", userId: "user-1" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/telemetry/opt-out",
        body: { orgId: "org-1", userId: "user-1" },
      },
      {
        method: "DELETE",
        url: "http://127.0.0.1:3210/api/v1/telemetry/events?orgId=org-1&userId=user-1",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { opted_in: false, row_count: 7 },
      { ok: true },
      { ok: true },
      { ok: true, deleted: 7 },
    ]);
  });
});

function responseFor(path: string, method: string): unknown {
  if (path === "/api/v1/telemetry/status" && method === "GET") return { opted_in: false, row_count: 7 };
  if (path === "/api/v1/telemetry/opt-in" && method === "POST") return { ok: true };
  if (path === "/api/v1/telemetry/opt-out" && method === "POST") return { ok: true };
  if (path === "/api/v1/telemetry/events" && method === "DELETE") return { ok: true, deleted: 7 };
  throw new Error(`unexpected request ${method} ${path}`);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
