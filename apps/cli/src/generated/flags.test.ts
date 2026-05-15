import { afterEach, describe, expect, test } from "bun:test";

import { createFlagsCommand } from "./flags.ts";

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

describe("generated feature flag commands", () => {
  test("routes experiment commands through the Nest feature experiment API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
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

    await createFlagsCommand().parseAsync(["experiments", "list", "--json"], { from: "user" });
    await createFlagsCommand().parseAsync([
      "experiments",
      "create",
      "--name",
      "layout",
      "--description",
      "layout test",
      "--variants",
      "control,dense",
      "--rollout-percent",
      "50",
      "--json",
    ], { from: "user" });
    await createFlagsCommand().parseAsync([
      "experiments",
      "assignments",
      "--experiment-id",
      "exp-1",
      "--json",
    ], { from: "user" });
    await createFlagsCommand().parseAsync([
      "experiments",
      "metrics",
      "--experiment-id",
      "exp-1",
      "--conversion-kind",
      "task.created",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/feature-flags/experiments",
        body: null,
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/feature-flags/experiments",
        body: {
          name: "layout",
          description: "layout test",
          variants: ["control", "dense"],
          rolloutPercent: 50,
        },
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/feature-flags/experiments/exp-1/assignments",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/feature-flags/experiments/exp-1/metrics?conversionKind=task.created",
        body: null,
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "exp-1", name: "layout", variants: ["control", "dense"], rolloutPercent: 50 }],
      { id: "exp-1", name: "layout", variants: ["control", "dense"], rolloutPercent: 50 },
      { control: 2, dense: 3 },
      { control: { assigned: 2, conversions: 1 }, dense: { assigned: 3, conversions: 2 } },
    ]);
  });

  test("routes feature flag management commands through the Nest feature flag API", async () => {
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

    await createFlagsCommand().parseAsync(["list", "--json"], { from: "user" });
    await createFlagsCommand().parseAsync([
      "evaluate",
      "--flag",
      "public-api",
      "--org-id",
      "org-2",
      "--user-id",
      "user-2",
      "--json",
    ], { from: "user" });
    await createFlagsCommand().parseAsync([
      "set",
      "--flag",
      "public-api",
      "--enabled",
      "--user-id",
      "user-2",
      "--json",
    ], { from: "user" });
    await createFlagsCommand().parseAsync([
      "set-override",
      "--flag",
      "experiments",
      "--disabled",
      "--json",
    ], { from: "user" });
    await createFlagsCommand().parseAsync([
      "set-rollout",
      "--flag",
      "router-llm",
      "--rollout-percent",
      "25",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/feature-flags?orgId=org-1&userId=user-1",
        body: null,
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/feature-flags/evaluate?orgId=org-2&userId=user-2&flag=public-api",
        body: null,
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/feature-flags",
        body: { orgId: "org-1", flag: "public-api", enabled: true, userId: "user-2" },
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/feature-flags/override",
        body: { orgId: "org-1", flag: "experiments", enabled: false },
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/feature-flags/rollout",
        body: { orgId: "org-1", flag: "router-llm", rolloutPercent: 25 },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ flag: "public-api", enabled: true, rolloutPercent: 100, source: "env" }],
      { flag: "public-api", enabled: true, rolloutPercent: 100, source: "org" },
      { flag: "public-api", enabled: true, rolloutPercent: 100, source: "user" },
      { flag: "experiments", enabled: false, rolloutPercent: 0, source: "org" },
      { flag: "router-llm", enabled: true, rolloutPercent: 25, source: "org" },
    ]);
  });
});

function responseFor(path: string, method: string): unknown {
  if (path === "/api/v1/feature-flags" && method === "GET") {
    return [{ flag: "public-api", enabled: true, rolloutPercent: 100, source: "env" }];
  }
  if (path === "/api/v1/feature-flags/evaluate") {
    return { flag: "public-api", enabled: true, rolloutPercent: 100, source: "org" };
  }
  if (path === "/api/v1/feature-flags" && method === "PATCH") {
    return { flag: "public-api", enabled: true, rolloutPercent: 100, source: "user" };
  }
  if (path === "/api/v1/feature-flags/override") {
    return { flag: "experiments", enabled: false, rolloutPercent: 0, source: "org" };
  }
  if (path === "/api/v1/feature-flags/rollout") {
    return { flag: "router-llm", enabled: true, rolloutPercent: 25, source: "org" };
  }
  if (path === "/api/v1/feature-flags/experiments" && method === "GET") {
    return [{ id: "exp-1", name: "layout", variants: ["control", "dense"], rolloutPercent: 50 }];
  }
  if (path === "/api/v1/feature-flags/experiments" && method === "POST") {
    return { id: "exp-1", name: "layout", variants: ["control", "dense"], rolloutPercent: 50 };
  }
  if (path === "/api/v1/feature-flags/experiments/exp-1/assignments") return { control: 2, dense: 3 };
  if (path === "/api/v1/feature-flags/experiments/exp-1/metrics") {
    return { control: { assigned: 2, conversions: 1 }, dense: { assigned: 3, conversions: 2 } };
  }
  throw new Error(`unexpected request ${method} ${path}`);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
