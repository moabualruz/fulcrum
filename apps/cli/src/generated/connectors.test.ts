import { afterEach, describe, expect, test } from "bun:test";

import { createConnectorsCommand } from "./connectors.ts";

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

describe("generated connector commands", () => {
  test("routes connector read commands through the Nest connector API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/notion")) {
        return Response.json({ name: "notion", enabled: true, config: null });
      }
      return Response.json([
        { name: "notion", enabled: true, config: null },
        { name: "confluence", enabled: false, config: null },
      ]);
    }) as typeof fetch;

    await createConnectorsCommand().parseAsync(["list", "--json"], { from: "user" });
    await createConnectorsCommand().parseAsync(["get", "--id", "notion", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/connectors",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/connectors/notion",
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [
        { name: "notion", enabled: true, config: null },
        { name: "confluence", enabled: false, config: null },
      ],
      { name: "notion", enabled: true, config: null },
    ]);
  });

  test("routes connector write and run commands through the Nest connector API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const parsedBody = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), method: init?.method, body: parsedBody });
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/enable")) {
        return Response.json({ name: "notion", enabled: true, config: parsedBody.config });
      }
      if (path.endsWith("/disable")) {
        return Response.json({ name: "notion", enabled: false, config: parsedBody.config ?? null });
      }
      if (path.endsWith("/sync")) {
        return Response.json({
          id: "run-1",
          orgId: "org-1",
          connectorId: "notion",
          status: "queued",
          trigger: parsedBody.trigger,
        });
      }
      if (path.endsWith("/connector-runs/run-1")) {
        return Response.json({ id: "run-1", orgId: "org-1", connectorId: "notion", status: "queued" });
      }
      return Response.json([
        { id: "run-1", orgId: "org-1", connectorId: "notion", status: "queued" },
      ]);
    }) as typeof fetch;

    await createConnectorsCommand().parseAsync([
      "enable",
      "--id",
      "notion",
      "--config-json",
      "{\"host\":\"https://notion.example\"}",
      "--json",
    ], { from: "user" });
    await createConnectorsCommand().parseAsync(["disable", "--id", "notion", "--json"], { from: "user" });
    await createConnectorsCommand().parseAsync([
      "sync",
      "--id",
      "notion",
      "--trigger",
      "manual",
      "--json",
    ], { from: "user" });
    await createConnectorsCommand().parseAsync([
      "runs",
      "list",
      "--connector-id",
      "notion",
      "--json",
    ], { from: "user" });
    await createConnectorsCommand().parseAsync(["runs", "get", "--id", "run-1", "--json"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/connectors/notion/enable",
        body: { orgId: "org-1", config: { host: "https://notion.example" } },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/connectors/notion/disable",
        body: { orgId: "org-1" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/connectors/notion/sync",
        body: { orgId: "org-1", trigger: "manual" },
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/connector-runs?orgId=org-1&connectorId=notion",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/connector-runs/run-1?orgId=org-1",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { name: "notion", enabled: true, config: { host: "https://notion.example" } },
      { name: "notion", enabled: false, config: null },
      { id: "run-1", orgId: "org-1", connectorId: "notion", status: "queued", trigger: "manual" },
      [{ id: "run-1", orgId: "org-1", connectorId: "notion", status: "queued" }],
      { id: "run-1", orgId: "org-1", connectorId: "notion", status: "queued" },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
