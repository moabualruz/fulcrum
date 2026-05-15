import { afterEach, describe, expect, test } from "bun:test";

import { createDataImportCommand } from "./dataImport.ts";

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

describe("generated data import commands", () => {
  test("routes data import through the Nest data portability API", async () => {
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
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json(responseFor(requestUrl.pathname));
    }) as typeof fetch;

    await createDataImportCommand().parseAsync(["preflight", "--path", "/tmp/export.json", "--json"], { from: "user" });
    await createDataImportCommand().parseAsync([
      "run",
      "--import-id",
      "/tmp/export.json",
      "--dry-run",
      "--on-conflict",
      "update",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/data-portability/import/preflight?orgId=org-1&userId=user-owner&path=%2Ftmp%2Fexport.json",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/data-portability/import/run",
        body: {
          orgId: "org-1",
          userId: "user-owner",
          importId: "/tmp/export.json",
          dryRun: true,
          onConflict: "update",
        },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      {
        importId: "/tmp/export.json",
        counts: { tasks: 1 },
        collisions: [{ kind: "tasks", id: "task-1" }],
      },
      {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        counts: { tasks: 1 },
      },
    ]);
  });
});

function responseFor(path: string): unknown {
  if (path === "/api/v1/data-portability/import/preflight") {
    return {
      importId: "/tmp/export.json",
      counts: { tasks: 1 },
      collisions: [{ kind: "tasks", id: "task-1" }],
    };
  }
  if (path === "/api/v1/data-portability/import/run") {
    return {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      counts: { tasks: 1 },
    };
  }
  throw new Error(`unexpected request ${path}`);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
