import { afterEach, describe, expect, test } from "bun:test";

import { createTasksCommand } from "./tasks.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalWorkspaceId = process.env["FULCRUM_WORKSPACE_ID"];
const originalOrgId = process.env["FULCRUM_ORG_ID"];
const originalUserId = process.env["FULCRUM_USER_ID"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_WORKSPACE_ID", originalWorkspaceId);
  restoreEnv("FULCRUM_ORG_ID", originalOrgId);
  restoreEnv("FULCRUM_USER_ID", originalUserId);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated task workflow commands", () => {
  test("route task CRUD commands through the Nest task API", async () => {
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
      calls.push({
        url: String(url),
        method: init?.method,
        body,
      });
      if (String(url).includes("/manual-workbench")) {
        return Response.json({ projectId: "project-1", layout: "kanban", listRows: [{ id: "task-1" }] });
      }
      if (String(url).includes("/children")) return Response.json([{ id: "child-1", parentId: "task-1" }]);
      if (String(url).includes("/parent")) return Response.json({ id: "task-1", parentId: body?.parentId ?? null });
      if (String(url).includes("/dependencies")) {
        return Response.json({ id: "task-1", dependencies: { blocks: ["task-2"], blocked_by: ["task-0"] } });
      }
      if (init?.method === "POST") return Response.json({ id: "task-created" });
      if (init?.method === "PATCH") return Response.json({ ok: true });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).includes("/task-1")) return Response.json({ id: "task-1", title: "One" });
      return Response.json([{ id: "task-1" }]);
    }) as typeof fetch;

    await runGeneratedTaskCommand(["list", "--project-id", "project-1", "--include-deleted", "--json"]);
    await runGeneratedTaskCommand([
      "manual-workbench",
      "--project-id",
      "project-1",
      "--view-mode",
      "board",
      "--statuses",
      "in_progress",
      "--state-groups",
      "started",
      "--labels",
      "agent,ux",
      "--priorities",
      "3",
      "--project-capabilities-estimate-enabled",
      "--json",
    ]);
    await runGeneratedTaskCommand(["create", "--project-id", "project-1", "--title", "New task", "--status", "todo", "--json"]);
    await runGeneratedTaskCommand(["get", "--id", "task-1", "--project-id", "project-1", "--json"]);
    await runGeneratedTaskCommand(["list-children", "--id", "task-1", "--project-id", "project-1", "--json"]);
    await runGeneratedTaskCommand(["update", "--id", "task-1", "--project-id", "project-1", "--status", "done", "--json"]);
    await runGeneratedTaskCommand([
      "set-dependencies",
      "--id",
      "task-1",
      "--project-id",
      "project-1",
      "--blocked-by",
      "task-0",
      "--blocks",
      "task-2",
      "--json",
    ]);
    await runGeneratedTaskCommand([
      "set-parent",
      "--id",
      "task-1",
      "--project-id",
      "project-1",
      "--parent-id",
      "parent-1",
      "--json",
    ]);
    await runGeneratedTaskCommand([
      "set-parent",
      "--id",
      "task-1",
      "--project-id",
      "project-1",
      "--clear-parent",
      "--json",
    ]);
    await runGeneratedTaskCommand(["delete", "--id", "task-1", "--project-id", "project-1", "--json"]);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/tasks?orgId=org-1&userId=user-1&projectId=project-1&include_deleted=true"],
      ["GET", "http://127.0.0.1:3210/api/v1/tasks/manual-workbench?orgId=org-1&userId=user-1&projectId=project-1&viewMode=board&projectCapabilitiesEstimateEnabled=true&statuses=in_progress&stateGroups=started&labels=agent%2Cux&priorities=3"],
      ["POST", "http://127.0.0.1:3210/api/v1/tasks?orgId=org-1&userId=user-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/tasks/task-1?orgId=org-1&userId=user-1&projectId=project-1"],
      ["GET", "http://127.0.0.1:3210/api/v1/tasks/task-1/children?orgId=org-1&userId=user-1&projectId=project-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/tasks/task-1?orgId=org-1&userId=user-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/tasks/task-1/dependencies?orgId=org-1&userId=user-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/tasks/task-1/parent?orgId=org-1&userId=user-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/tasks/task-1/parent?orgId=org-1&userId=user-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/tasks/task-1?orgId=org-1&userId=user-1&projectId=project-1"],
    ]);
    expect(calls[2]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      title: "New task",
      status: "todo",
    });
    expect(calls[5]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      status: "done",
    });
    expect(calls[6]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      blocks: ["task-2"],
      blocked_by: ["task-0"],
    });
    expect(calls[7]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      parentId: "parent-1",
    });
    expect(calls[8]?.body).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      parentId: null,
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      [{ id: "task-1" }],
      { projectId: "project-1", layout: "kanban", listRows: [{ id: "task-1" }] },
      { id: "task-created" },
      { id: "task-1", title: "One" },
      [{ id: "child-1", parentId: "task-1" }],
      { ok: true },
      { id: "task-1", dependencies: { blocks: ["task-2"], blocked_by: ["task-0"] } },
      { id: "task-1", parentId: "parent-1" },
      { id: "task-1", parentId: null },
      { ok: true },
    ]);
  });

  test("route dependency run and QA commands through the Nest workflow API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_WORKSPACE_ID"] = "workspace-1";
    const calls: Array<{ url: string; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (String(url).includes("/automated-feedback-loop")) {
        return Response.json({ runGroupId: "trace-1", stopReason: "automated_feedback_exhausted" });
      }
      if (String(url).includes("/dispatch")) return Response.json({ runGroupId: "trace-1" });
      if (String(url).includes("/live-feedback")) return Response.json({ traceId: "trace-1", events: [] });
      if (String(url).includes("/worker-tick")) return Response.json({ processedRun: null, traceId: "trace-1" });
      if (String(url).includes("/qa-review")) return Response.json({ taskId: "task-1", verdict: "REVISE" });
      return Response.json({ traceId: "trace-1", orderedTaskIds: ["task-1"] });
    }) as typeof fetch;

    await runGeneratedTaskCommand([
      "preview-dependency-run",
      "--project-id",
      "project-1",
      "--target-task-ids",
      "task-1",
      "--trace-id",
      "trace-1",
      "--json",
    ]);
    await runGeneratedTaskCommand([
      "dispatch-dependency-run",
      "--project-id",
      "project-1",
      "--target-task-ids",
      "task-1",
      "--agent",
      "codex",
      "--trace-id",
      "trace-1",
      "--json",
    ]);
    await runGeneratedTaskCommand([
      "dependency-run-live-feedback",
      "--project-id",
      "project-1",
      "--trace-id",
      "trace-1",
      "--json",
    ]);
    await runGeneratedTaskCommand([
      "run-dependency-run-worker-tick",
      "--project-id",
      "project-1",
      "--trace-id",
      "trace-1",
      "--worker-id",
      "worker-1",
      "--json",
    ]);
    await runGeneratedTaskCommand([
      "run-automated-feedback-loop",
      "--project-id",
      "project-1",
      "--trace-id",
      "trace-1",
      "--worker-id",
      "worker-1",
      "--review-type",
      "code",
      "--feedback-agent",
      "codex",
      "--max-iterations",
      "3",
      "--json",
    ]);
    await runGeneratedTaskCommand([
      "record-qa-review",
      "--project-id",
      "project-1",
      "--task-id",
      "task-1",
      "--review-text",
      "### Verdict: REVISE",
      "--json",
    ]);

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3210/workflows/execution/dependency-run/preview",
      "http://127.0.0.1:3210/workflows/execution/dependency-run/dispatch",
      "http://127.0.0.1:3210/workflows/execution/dependency-run/live-feedback",
      "http://127.0.0.1:3210/workflows/execution/dependency-run/worker-tick",
      "http://127.0.0.1:3210/workflows/execution/dependency-run/automated-feedback-loop",
      "http://127.0.0.1:3210/workflows/execution/qa-review/record",
    ]);
    expect(calls[1]?.body).toMatchObject({
      workspaceId: "workspace-1",
      projectId: "project-1",
      targetTaskIds: ["task-1"],
      agent: "codex",
    });
    expect(calls[4]?.body).toMatchObject({
      workspaceId: "workspace-1",
      projectId: "project-1",
      traceId: "trace-1",
      workerId: "worker-1",
      reviewType: "code",
      feedbackAgent: "codex",
      maxIterations: 3,
    });
    expect(calls[5]?.body).toMatchObject({
      workspaceId: "workspace-1",
      projectId: "project-1",
      taskId: "task-1",
      reviewType: "code",
      reviewText: "### Verdict: REVISE",
    });
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { traceId: "trace-1", orderedTaskIds: ["task-1"] },
      { runGroupId: "trace-1" },
      { traceId: "trace-1", events: [] },
      { processedRun: null, traceId: "trace-1" },
      { runGroupId: "trace-1", stopReason: "automated_feedback_exhausted" },
      { taskId: "task-1", verdict: "REVISE" },
    ]);
  });
});

async function runGeneratedTaskCommand(args: string[]): Promise<void> {
  const command = createTasksCommand();
  command.exitOverride();
  await command.parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
