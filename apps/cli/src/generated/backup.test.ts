import { afterEach, describe, expect, test } from "bun:test";

import { createBackupCommand } from "./backup.ts";

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

describe("generated backup commands", () => {
  test("routes backup commands through the Nest data portability API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-owner";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json(responseFor(new URL(String(url)).pathname));
    }) as typeof fetch;

    await createBackupCommand().parseAsync(["create", "--json"], { from: "user" });
    await createBackupCommand().parseAsync(["restore", "--dump", "encoded-dump", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/data-portability/backup",
        body: { orgId: "org-1", userId: "user-owner" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/data-portability/backup/restore",
        body: { orgId: "org-1", userId: "user-owner", dump: "encoded-dump" },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { format: "fulcrum.db-dump.v1", dump: "encoded-dump", entityCounts: { tasks: 1 } },
      { format: "fulcrum.db-dump.v1", entityCounts: { tasks: 1 } },
    ]);
  });
});

function responseFor(path: string): unknown {
  if (path === "/api/v1/data-portability/backup") {
    return { format: "fulcrum.db-dump.v1", dump: "encoded-dump", entityCounts: { tasks: 1 } };
  }
  if (path === "/api/v1/data-portability/backup/restore") {
    return { format: "fulcrum.db-dump.v1", entityCounts: { tasks: 1 } };
  }
  throw new Error(`unexpected request ${path}`);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
