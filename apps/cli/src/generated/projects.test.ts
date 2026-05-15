import { afterEach, describe, expect, test } from "bun:test";

import { createProjectsCommand } from "./projects.ts";

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

describe("generated project workflow commands", () => {
  test("route project commands through the Nest project API", async () => {
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
      if (init?.method === "POST") return Response.json({ id: "project-created", slug: body?.slug });
      if (init?.method === "PATCH") return Response.json({ id: "project-1", name: body?.name });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).endsWith("/stats?orgId=org-1")) return Response.json({ taskCount: 3, doneTaskCount: 1 });
      if (String(url).includes("/project-1")) return Response.json({ id: "project-1", name: "Project 1" });
      return Response.json({ data: [{ id: "project-1" }] });
    }) as typeof fetch;

    await runGeneratedProjectCommand(["list", "--json"]);
    await runGeneratedProjectCommand([
      "create",
      "--kind",
      "project",
      "--name",
      "Project 1",
      "--slug",
      "project-1",
      "--repo-path",
      "/tmp/project-1",
      "--template",
      "default",
      "--json",
    ]);
    await runGeneratedProjectCommand(["get", "--id", "project-1", "--json"]);
    await runGeneratedProjectCommand(["update", "--id", "project-1", "--name", "Project 1 revised", "--json"]);
    await runGeneratedProjectCommand(["stats", "--id", "project-1", "--json"]);
    await runGeneratedProjectCommand(["delete", "--id", "project-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/projects?orgId=org-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/projects"],
      ["GET", "http://127.0.0.1:3210/api/v1/projects/project-1?orgId=org-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/projects/project-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/projects/project-1/stats?orgId=org-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/projects/project-1?orgId=org-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      orgId: "org-1",
      kind: "project",
      name: "Project 1",
      slug: "project-1",
      repoPath: "/tmp/project-1",
      template: "default",
    });
    expect(calls[3]?.body).toMatchObject({
      orgId: "org-1",
      name: "Project 1 revised",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { data: [{ id: "project-1" }] },
      { id: "project-created", slug: "project-1" },
      { id: "project-1", name: "Project 1" },
      { id: "project-1", name: "Project 1 revised" },
      { taskCount: 3, doneTaskCount: 1 },
      { ok: true },
    ]);
  });
});

async function runGeneratedProjectCommand(args: string[]): Promise<void> {
  await createProjectsCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
