import { afterEach, describe, expect, test } from "bun:test";

import { createSprintsCommand } from "./sprints.ts";

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

describe("generated sprint workflow commands", () => {
  test("route sprint commands through the Nest sprint API", async () => {
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
      if (String(url).includes("/tasks/task-1")) return Response.json({ id: "assignment-1", taskId: "task-1" });
      if (String(url).endsWith("/tasks")) return Response.json({ id: "assignment-1", taskId: body?.taskId });
      if (init?.method === "POST") return Response.json({ id: "sprint-created" });
      if (init?.method === "PATCH") return Response.json({ id: "sprint-1", status: body?.status ?? "planning" });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).includes("/sprint-1")) return Response.json({ id: "sprint-1", name: "Sprint 1" });
      return Response.json({ data: [{ id: "sprint-1" }] });
    }) as typeof fetch;

    await runGeneratedSprintCommand(["list", "--project-id", "project-1", "--status", "active", "--json"]);
    await runGeneratedSprintCommand(["create", "--project-id", "project-1", "--name", "Sprint 1", "--json"]);
    await runGeneratedSprintCommand(["get", "--id", "sprint-1", "--json"]);
    await runGeneratedSprintCommand(["update", "--id", "sprint-1", "--name", "Sprint 1 revised", "--status", "active", "--json"]);
    await runGeneratedSprintCommand(["start", "--id", "sprint-1", "--json"]);
    await runGeneratedSprintCommand(["close", "--id", "sprint-1", "--json"]);
    await runGeneratedSprintCommand(["add-task", "--id", "sprint-1", "--task-id", "task-1", "--json"]);
    await runGeneratedSprintCommand(["remove-task", "--id", "sprint-1", "--task-id", "task-1", "--json"]);
    await runGeneratedSprintCommand(["delete", "--id", "sprint-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/sprints?orgId=org-1&projectId=project-1&status=active"],
      ["POST", "http://127.0.0.1:3210/api/v1/sprints"],
      ["GET", "http://127.0.0.1:3210/api/v1/sprints/sprint-1?orgId=org-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/sprints/sprint-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/sprints/sprint-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/sprints/sprint-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/sprints/sprint-1/tasks"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/sprints/sprint-1/tasks/task-1?orgId=org-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/sprints/sprint-1?orgId=org-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      orgId: "org-1",
      projectId: "project-1",
      name: "Sprint 1",
    });
    expect(calls[3]?.body).toMatchObject({
      orgId: "org-1",
      name: "Sprint 1 revised",
      status: "active",
    });
    expect(calls[4]?.body).toMatchObject({ orgId: "org-1", status: "active" });
    expect(calls[5]?.body).toMatchObject({ orgId: "org-1", status: "completed" });
    expect(calls[6]?.body).toMatchObject({ orgId: "org-1", taskId: "task-1" });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { data: [{ id: "sprint-1" }] },
      { id: "sprint-created" },
      { id: "sprint-1", name: "Sprint 1" },
      { id: "sprint-1", status: "active" },
      { id: "sprint-1", status: "active" },
      { id: "sprint-1", status: "completed" },
      { id: "assignment-1", taskId: "task-1" },
      { id: "assignment-1", taskId: "task-1" },
      { ok: true },
    ]);
  });
});

async function runGeneratedSprintCommand(args: string[]): Promise<void> {
  await createSprintsCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
