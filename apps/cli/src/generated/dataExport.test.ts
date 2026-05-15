import { afterEach, describe, expect, test } from "bun:test";

import { createDataExportCommand } from "./dataExport.ts";

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

describe("generated data export commands", () => {
  test("routes data export through the Nest data portability API", async () => {
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
      return Response.json({
        format: "fulcrum.json-export.v1",
        json: "{\"format\":\"fulcrum.json-export.v1\"}",
        entityCounts: { tasks: 1 },
        outputPath: "/tmp/export.json",
      });
    }) as typeof fetch;

    await createDataExportCommand().parseAsync([
      "create",
      "--output-path",
      "/tmp/export.json",
      "--pretty",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/data-portability/export",
        body: {
          orgId: "org-1",
          userId: "user-owner",
          outputPath: "/tmp/export.json",
          pretty: true,
        },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      {
        format: "fulcrum.json-export.v1",
        json: "{\"format\":\"fulcrum.json-export.v1\"}",
        entityCounts: { tasks: 1 },
        outputPath: "/tmp/export.json",
      },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
