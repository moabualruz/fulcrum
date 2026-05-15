import { afterEach, describe, expect, test } from "bun:test";

import { createSavedViewsCommand } from "./saved_views.ts";

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

describe("generated saved-view commands", () => {
  test("route saved-view commands through the Nest saved-view API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), method: init?.method, body });
      if (init?.method === "POST") return Response.json({ id: "view-created", name: body?.name });
      if (init?.method === "PATCH") return Response.json({ id: "view-1", name: body?.name });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).includes("/view-1")) return Response.json({ id: "view-1", name: "View 1" });
      return Response.json([{ id: "view-1" }]);
    }) as typeof fetch;

    await runGeneratedSavedViewCommand(["list", "--project-id", "project-1", "--json"]);
    await runGeneratedSavedViewCommand([
      "create",
      "--project-id",
      "project-1",
      "--name",
      "View 1",
      "--scope",
      "project",
      "--view-type",
      "kanban",
      "--json",
    ]);
    await runGeneratedSavedViewCommand(["get", "--id", "view-1", "--json"]);
    await runGeneratedSavedViewCommand(["update", "--id", "view-1", "--name", "View 1 revised", "--json"]);
    await runGeneratedSavedViewCommand(["delete", "--id", "view-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/saved-views?orgId=org-1&projectId=project-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/saved-views"],
      ["GET", "http://127.0.0.1:3210/api/v1/saved-views/view-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/saved-views/view-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/saved-views/view-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      orgId: "org-1",
      projectId: "project-1",
      name: "View 1",
      scope: "project",
      viewType: "kanban",
    });
    expect(calls[3]?.body).toMatchObject({
      name: "View 1 revised",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "view-1" }],
      { id: "view-created", name: "View 1" },
      { id: "view-1", name: "View 1" },
      { id: "view-1", name: "View 1 revised" },
      { ok: true },
    ]);
  });
});

async function runGeneratedSavedViewCommand(args: string[]): Promise<void> {
  await createSavedViewsCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
