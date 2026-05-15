import { afterEach, describe, expect, test } from "bun:test";

import { createContextCommand } from "./context.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalToken = process.env["FULCRUM_API_TOKEN"];
const originalPublicToken = process.env["FULCRUM_PUBLIC_API_TOKEN"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_API_TOKEN", originalToken);
  restoreEnv("FULCRUM_PUBLIC_API_TOKEN", originalPublicToken);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated context commands", () => {
  test("route context assemble and preview through the Nest context API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_API_TOKEN"] = "token-context";
    const calls: Array<{ url: string; method: string | undefined; authorization: string | null }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return Response.json({ taskId: new URL(String(url)).searchParams.get("taskId"), slices: ["docs", "memory"] });
    }) as typeof fetch;

    await createContextCommand().parseAsync([
      "assemble",
      "--task-id",
      "task-1",
      "--budget",
      "5000",
      "--json",
    ], { from: "user" });
    await createContextCommand().parseAsync([
      "preview",
      "--task",
      "task-2",
      "--include-global",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/context/preview?taskId=task-1&budget=5000",
        method: "GET",
        authorization: "Bearer token-context",
      },
      {
        url: "http://127.0.0.1:3210/api/v1/context/preview?taskId=task-2&includeGlobal=true",
        method: "GET",
        authorization: "Bearer token-context",
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { taskId: "task-1", slices: ["docs", "memory"] },
      { taskId: "task-2", slices: ["docs", "memory"] },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
