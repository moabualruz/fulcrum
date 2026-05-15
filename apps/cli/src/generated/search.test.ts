import { afterEach, describe, expect, test } from "bun:test";

import { createSearchCommand } from "./search.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalOrgId = process.env["FULCRUM_ORG_ID"];
const originalUserId = process.env["FULCRUM_USER_ID"];
const originalToken = process.env["FULCRUM_API_TOKEN"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_ORG_ID", originalOrgId);
  restoreEnv("FULCRUM_USER_ID", originalUserId);
  restoreEnv("FULCRUM_API_TOKEN", originalToken);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated search commands", () => {
  test("route search commands through the Nest search API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-1";
    process.env["FULCRUM_API_TOKEN"] = "token-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown; authorization: string | null }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), method: init?.method, body, authorization: headers.get("authorization") });
      if (String(url).includes("/suggest")) return Response.json({ suggestions: ["kernel"] });
      if (String(url).includes("/snapshot")) return Response.json({ snapshot: "{\"entries\":[]}" });
      if (String(url).includes("/saved/saved-1") && init?.method === "PATCH") return Response.json({ id: "saved-1", name: body?.name });
      if (String(url).includes("/saved/saved-1") && init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).endsWith("/saved") && init?.method === "POST") return Response.json({ id: "saved-created", name: body?.name });
      if (String(url).endsWith("/saved?org_id=org-1&user_id=user-1")) return Response.json([{ id: "saved-1" }]);
      if (String(url).includes("/click")) return Response.json({ recorded: true });
      return Response.json([{ id: "hit-1", title: "Kernel" }]);
    }) as typeof fetch;

    await runGeneratedSearchCommand(["query", "--term", "kernel", "--filters-scope", "current", "--limit", "5", "--json"]);
    await runGeneratedSearchCommand(["suggest", "--term", "ker", "--limit", "3", "--json"]);
    await runGeneratedSearchCommand(["saved-list", "--json"]);
    await runGeneratedSearchCommand([
      "saved-create",
      "--name",
      "Kernel search",
      "--scope",
      "private",
      "--project-id",
      "project-1",
      "--query-json-text",
      "{\"q\":\"kernel\"}",
      "--json",
    ]);
    await runGeneratedSearchCommand([
      "saved-update",
      "--id",
      "saved-1",
      "--name",
      "Kernel search revised",
      "--query-json-text",
      "{\"q\":\"kernel revised\"}",
      "--json",
    ]);
    await runGeneratedSearchCommand([
      "record-click",
      "--query",
      "kernel",
      "--result-id",
      "hit-1",
      "--result-kind",
      "page",
      "--position",
      "1",
      "--json",
    ]);
    await runGeneratedSearchCommand(["snapshot", "--json"]);
    await runGeneratedSearchCommand(["saved-delete", "--id", "saved-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/search?q=kernel&org_id=org-1&project_id=current&limit=5"],
      ["GET", "http://127.0.0.1:3210/api/v1/search/suggest?prefix=ker&org_id=org-1&limit=3"],
      ["GET", "http://127.0.0.1:3210/api/v1/search/saved?org_id=org-1&user_id=user-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/search/saved"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/search/saved/saved-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/search/click"],
      ["GET", "http://127.0.0.1:3210/api/v1/search/snapshot?org_id=org-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/search/saved/saved-1?org_id=org-1&user_id=user-1"],
    ]);
    expect(calls.every((call) => call.authorization === "Bearer token-1")).toBe(true);
    expect(calls[3]?.body).toMatchObject({
      org_id: "org-1",
      user_id: "user-1",
      name: "Kernel search",
      query_json: { q: "kernel" },
      scope: "private",
      project_id: "project-1",
    });
    expect(calls[4]?.body).toMatchObject({
      org_id: "org-1",
      user_id: "user-1",
      name: "Kernel search revised",
      query_json: { q: "kernel revised" },
    });
    expect(calls[5]?.body).toMatchObject({
      org_id: "org-1",
      user_id: "user-1",
      query: "kernel",
      result_id: "hit-1",
      result_kind: "page",
      position: 1,
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "hit-1", title: "Kernel" }],
      { suggestions: ["kernel"] },
      [{ id: "saved-1" }],
      { id: "saved-created", name: "Kernel search" },
      { id: "saved-1", name: "Kernel search revised" },
      { recorded: true },
      { snapshot: "{\"entries\":[]}" },
      { ok: true },
    ]);
  });
});

async function runGeneratedSearchCommand(args: string[]): Promise<void> {
  await createSearchCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
