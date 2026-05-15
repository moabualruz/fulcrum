import { afterEach, describe, expect, test } from "bun:test";

import { createWorkflowsCommand } from "./workflows.ts";

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

describe("generated workflow commands", () => {
  test("routes acceptance cycle through the Nest workflow API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({ traceId: "trace-1", status: "ready_for_uat" });
    }) as typeof fetch;

    await createWorkflowsCommand().parseAsync([
      "run-acceptance-cycle",
      "--workspace-json",
      "{\"id\":\"workspace-1\",\"slug\":\"workspace\",\"name\":\"Workspace\"}",
      "--project-json",
      "{\"id\":\"project-1\",\"slug\":\"project\",\"name\":\"Project\",\"traceId\":\"trace-1\"}",
      "--freeform-json",
      "{\"documentId\":\"doc-1\",\"title\":\"Brief\",\"bodyMd\":\"Body\",\"userPrompt\":\"Build\"}",
      "--guided-planning-json",
      "{\"acpSessionId\":\"acp-1\",\"agentName\":\"codex\",\"cwd\":\"/workspace\",\"permissionMode\":\"review_each_tool\"}",
      "--approved-plan-json",
      "{\"planId\":\"plan-1\",\"reviewId\":\"review-1\",\"markdown\":\"# Plan\"}",
      "--execution-json",
      "{\"agent\":\"codex\",\"model\":\"gpt-5.4\",\"prompt\":\"Run\",\"lifecycleSummary\":\"Done\",\"qaReviewText\":\"Approve\",\"qaReviewType\":\"code\"}",
      "--uat-json",
      "{\"decision\":\"approve_without_manual_review\",\"reviewType\":\"uat\",\"e2eRunner\":\"bun\"}",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/cycles/acceptance-cycle/run",
        body: {
          workspace: { id: "workspace-1", slug: "workspace", name: "Workspace" },
          project: { id: "project-1", slug: "project", name: "Project", traceId: "trace-1" },
          freeform: { documentId: "doc-1", title: "Brief", bodyMd: "Body", userPrompt: "Build" },
          guidedPlanning: {
            acpSessionId: "acp-1",
            agentName: "codex",
            cwd: "/workspace",
            permissionMode: "review_each_tool",
          },
          approvedPlan: { planId: "plan-1", reviewId: "review-1", markdown: "# Plan" },
          execution: {
            agent: "codex",
            model: "gpt-5.4",
            prompt: "Run",
            lifecycleSummary: "Done",
            qaReviewText: "Approve",
            qaReviewType: "code",
          },
          uat: { decision: "approve_without_manual_review", reviewType: "uat", e2eRunner: "bun" },
        },
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { traceId: "trace-1", status: "ready_for_uat" },
    ]);
  });

  test("routes workflow settings commands through the Nest workflow settings API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "workspace-1";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const output: unknown[] = [];
    console.log = (line?: unknown) => {
      output.push(JSON.parse(String(line)));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith("/default")) {
        return Response.json({ methodology: "scrum", transitions: { Backlog: ["Todo"] } });
      }
      if (pathname.endsWith("/task-types/get")) {
        return Response.json({ projectId: "project-1", enabledTaskTypes: ["epic", "task"] });
      }
      if (pathname.endsWith("/methodology/get")) {
        return Response.json({ projectId: "project-1", methodology: "kanban" });
      }
      if (pathname.endsWith("/transitions/get")) {
        return Response.json({ projectId: "project-1", transitions: { Backlog: ["InProgress"] } });
      }
      if (pathname.endsWith("/task-types/update")) {
        return Response.json({ projectId: "project-1", enabledTaskTypes: ["task", "bug"] });
      }
      if (pathname.endsWith("/methodology/update")) {
        return Response.json({ projectId: "project-1", methodology: "scrum" });
      }
      if (pathname.endsWith("/transitions/update")) {
        return Response.json({ projectId: "project-1", transitions: { Todo: ["Done"] } });
      }
      return Response.json({ projectId: "project-1", allowed: true });
    }) as typeof fetch;

    await createWorkflowsCommand().parseAsync(["get-default", "--methodology", "scrum", "--json"], { from: "user" });
    await createWorkflowsCommand().parseAsync(["get-enabled-task-types", "--project-id", "project-1", "--json"], { from: "user" });
    await createWorkflowsCommand().parseAsync(["get-methodology", "--project-id", "project-1", "--json"], { from: "user" });
    await createWorkflowsCommand().parseAsync(["get-transitions", "--project-id", "project-1", "--json"], { from: "user" });
    await createWorkflowsCommand().parseAsync([
      "update-enabled-task-types",
      "--project-id",
      "project-1",
      "--types",
      "task,bug",
      "--json",
    ], { from: "user" });
    await createWorkflowsCommand().parseAsync([
      "update-methodology",
      "--project-id",
      "project-1",
      "--methodology",
      "scrum",
      "--reset-workflow",
      "--json",
    ], { from: "user" });
    await createWorkflowsCommand().parseAsync([
      "update-transitions",
      "--project-id",
      "project-1",
      "--transitions-json",
      "{\"Todo\":[\"Done\"]}",
      "--json",
    ], { from: "user" });
    await createWorkflowsCommand().parseAsync([
      "validate-transition",
      "--project-id",
      "project-1",
      "--from-status",
      "Todo",
      "--to-status",
      "Done",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/default",
        body: { methodology: "scrum" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/task-types/get",
        body: { orgId: "workspace-1", projectId: "project-1" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/methodology/get",
        body: { orgId: "workspace-1", projectId: "project-1" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/transitions/get",
        body: { orgId: "workspace-1", projectId: "project-1" },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/task-types/update",
        body: { orgId: "workspace-1", projectId: "project-1", types: ["task", "bug"] },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/methodology/update",
        body: { orgId: "workspace-1", projectId: "project-1", methodology: "scrum", resetWorkflow: true },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/transitions/update",
        body: { orgId: "workspace-1", projectId: "project-1", transitions: { Todo: ["Done"] } },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/workflows/transitions/validate",
        body: { orgId: "workspace-1", projectId: "project-1", fromStatus: "Todo", toStatus: "Done" },
      },
    ]);
    expect(output).toEqual([
      expect.objectContaining({ methodology: "scrum" }),
      expect.objectContaining({ enabledTaskTypes: ["epic", "task"] }),
      expect.objectContaining({ methodology: "kanban" }),
      expect.objectContaining({ transitions: { Backlog: ["InProgress"] } }),
      expect.objectContaining({ enabledTaskTypes: ["task", "bug"] }),
      expect.objectContaining({ methodology: "scrum" }),
      expect.objectContaining({ transitions: { Todo: ["Done"] } }),
      expect.objectContaining({ allowed: true }),
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
