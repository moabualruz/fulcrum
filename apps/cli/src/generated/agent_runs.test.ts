import { afterEach, describe, expect, test } from "bun:test";

import { createAgentRunsCommand } from "./agent_runs.ts";

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

describe("generated agent run commands", () => {
  test("route agent run commands through the Nest run API", async () => {
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
      if (String(url).includes("/cancel")) return Response.json({ ok: true });
      if (String(url).includes("/retry")) return Response.json({ id: "run-retry", status: "queued" });
      if (init?.method === "POST") return Response.json({ id: "run-created", dependencyTree: body?.dependencyTree });
      if (String(url).includes("/run-1")) return Response.json({ id: "run-1", status: "running" });
      return Response.json([{ id: "run-1" }]);
    }) as typeof fetch;

    await runGeneratedAgentRunCommand(["list", "--status", "running", "--limit", "5", "--offset", "2", "--json"]);
    await runGeneratedAgentRunCommand([
      "create",
      "--project-id",
      "project-1",
      "--task-id",
      "task-1",
      "--agent",
      "codex",
      "--trace-id",
      "trace-1",
      "--dependency-tree",
      "task-0,task-1",
      "--json",
    ]);
    await runGeneratedAgentRunCommand(["get", "--id", "run-1", "--json"]);
    await runGeneratedAgentRunCommand(["cancel", "--id", "run-1", "--json"]);
    await runGeneratedAgentRunCommand(["retry", "--id", "run-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/runs?orgId=org-1&status=running&limit=5&offset=2"],
      ["POST", "http://127.0.0.1:3210/api/v1/runs?orgId=org-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/runs/run-1?orgId=org-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/runs/run-1/cancel?orgId=org-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/runs/run-1/retry?orgId=org-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({
      projectId: "project-1",
      taskId: "task-1",
      agent: "codex",
      traceId: "trace-1",
      dependencyTree: ["task-0", "task-1"],
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "run-1" }],
      { id: "run-created", dependencyTree: ["task-0", "task-1"] },
      { id: "run-1", status: "running" },
      { ok: true },
      { id: "run-retry", status: "queued" },
    ]);
  });
});

async function runGeneratedAgentRunCommand(args: string[]): Promise<void> {
  await createAgentRunsCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
