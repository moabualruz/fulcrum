import { afterEach, describe, expect, test } from "bun:test";

import { createMemoriesCommand } from "./memories.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalToken = process.env["FULCRUM_API_TOKEN"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_API_TOKEN", originalToken);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated memory commands", () => {
  test("route memory commands through the Nest memory API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
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
      if (init?.method === "POST" && String(url).endsWith("/memory")) return Response.json({ id: "memory-created", body: body?.body });
      if (init?.method === "PATCH") return Response.json({ id: "memory-1", body: body?.body });
      if (init?.method === "DELETE") return Response.json({ deleted: true, id: "memory-1" });
      if (init?.method === "POST" && String(url).includes("/promote")) return Response.json({ id: "memory-1", global: true });
      if (String(url).includes("/search")) return Response.json([{ id: "memory-1", body: "Planning memory" }]);
      if (String(url).includes("/memory-1")) return Response.json({ id: "memory-1", body: "Memory 1" });
      return Response.json([{ id: "memory-1" }]);
    }) as typeof fetch;

    await runGeneratedMemoryCommand(["list", "--project-id", "project-1", "--kind", "note", "--limit", "10", "--json"]);
    await runGeneratedMemoryCommand([
      "create",
      "--project-id",
      "project-1",
      "--body",
      "Created memory",
      "--tags",
      "planning,api",
      "--importance",
      "high",
      "--json",
    ]);
    await runGeneratedMemoryCommand(["get", "--id", "memory-1", "--json"]);
    await runGeneratedMemoryCommand(["update", "--id", "memory-1", "--body", "Updated memory", "--json"]);
    await runGeneratedMemoryCommand(["promote", "--id", "memory-1", "--json"]);
    await runGeneratedMemoryCommand(["search", "--query", "planning", "--project-id", "project-1", "--json"]);
    await runGeneratedMemoryCommand(["delete", "--id", "memory-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/memory?projectId=project-1&kind=note&limit=10"],
      ["POST", "http://127.0.0.1:3210/api/v1/memory"],
      ["GET", "http://127.0.0.1:3210/api/v1/memory/memory-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/memory/memory-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/memory/memory-1/promote"],
      ["GET", "http://127.0.0.1:3210/api/v1/memory/search?projectId=project-1&query=planning"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/memory/memory-1?confirm=true"],
    ]);
    expect(calls.every((call) => call.authorization === "Bearer token-1")).toBe(true);
    expect(calls[1]?.body).toMatchObject({
      projectId: "project-1",
      body: "Created memory",
      tags: ["planning", "api"],
      importance: "high",
      source: "manual",
    });
    expect(calls[3]?.body).toMatchObject({ body: "Updated memory" });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "memory-1" }],
      { id: "memory-created", body: "Created memory" },
      { id: "memory-1", body: "Memory 1" },
      { id: "memory-1", body: "Updated memory" },
      { id: "memory-1", global: true },
      [{ id: "memory-1", body: "Planning memory" }],
      { deleted: true, id: "memory-1" },
    ]);
  });
});

async function runGeneratedMemoryCommand(args: string[]): Promise<void> {
  await createMemoriesCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
