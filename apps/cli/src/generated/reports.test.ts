import { afterEach, describe, expect, test } from "bun:test";

import { createReportsCommand } from "./reports.ts";

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

describe("generated report commands", () => {
  test("routes burndown through the Nest report API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return Response.json({ data: [{ date: "2026-05-14", remaining: 3 }] });
    }) as typeof fetch;

    await createReportsCommand().parseAsync([
      "burndown",
      "--project-id",
      "project-1",
      "--sprint-id",
      "sprint-1",
      "--json",
    ], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/reports/burndown?orgId=org-1&projectId=project-1&sprintId=sprint-1",
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { data: [{ date: "2026-05-14", remaining: 3 }] },
    ]);
  });

  test("routes final QA and UAT review commands through the Nest workflow API", async () => {
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
      return Response.json({ ok: true, url: String(url) });
    }) as typeof fetch;

    for (const args of [
      ["final-qa", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--task-ids", "task-1,task-2", "--json"],
      ["final-qa-feedback-gate", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--task-ids", "task-1", "--worker-id", "worker-1", "--reviewer-agent", "review-agent", "--feedback-agent", "qa-agent", "--feedback-model", "model-1", "--max-iterations", "3", "--cwd", "/repo", "--copy-to-worktree", "apps/web,services/workflow-coordination", "--json"],
      ["uat-code-review-handoff", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--task-ids", "task-1", "--json"],
      ["record-uat-code-review-decision", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--task-ids", "task-1", "--decision", "request_changes", "--review-type", "code_review", "--feedback-text", "Fix acceptance gap", "--feedback-agent", "qa-agent", "--feedback-model", "model-1", "--e2e-runner", "bun", "--json"],
      ["apply-configured-uat-code-review-decision", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--task-ids", "task-1", "--json"],
      ["run-generated-e2e-regression-tests", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--task-ids", "task-1", "--runner", "playwright", "--plan-only", "--json"],
    ]) {
      await createReportsCommand().parseAsync(args, { from: "user" });
    }

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/final-qa/report",
        body: workflowBody({ traceId: "trace-1", taskIds: ["task-1", "task-2"] }),
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/final-qa/feedback-gate",
        body: workflowBody({
          traceId: "trace-1",
          taskIds: ["task-1"],
          workerId: "worker-1",
          reviewerAgent: "review-agent",
          feedbackAgent: "qa-agent",
          feedbackModel: "model-1",
          maxIterations: 3,
          cwd: "/repo",
          copyToWorktree: ["apps/web", "services/workflow-coordination"],
        }),
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/uat-code-review/handoff",
        body: workflowBody({ traceId: "trace-1", taskIds: ["task-1"] }),
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/uat-code-review/decision/record",
        body: workflowBody({
          traceId: "trace-1",
          taskIds: ["task-1"],
          decision: "request_changes",
          reviewType: "code_review",
          feedbackText: "Fix acceptance gap",
          feedbackAgent: "qa-agent",
          feedbackModel: "model-1",
          e2eRunner: "bun",
        }),
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/uat-code-review/decision/apply-configured",
        body: workflowBody({ traceId: "trace-1", taskIds: ["task-1"] }),
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/generated-e2e/run",
        body: workflowBody({ traceId: "trace-1", taskIds: ["task-1"], runner: "playwright", planOnly: true }),
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toHaveLength(6);
  });

  test("routes review workbench session commands through the Nest workflow API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    console.log = () => {};
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({ ok: true });
    }) as typeof fetch;

    const filesJson = JSON.stringify([{ path: "src/app.ts", patch: "@@ -1 +1 @@", additions: 1, deletions: 0 }]);
    const annotationsJson = JSON.stringify([{ id: "ann-1", filePath: "src/app.ts", lineStart: 1, lineEnd: 1, text: "Check this" }]);

    for (const args of [
      ["review-workbench", "--project-id", "project-1", "--trace-id", "trace-1", "--review-id", "review-1", "--files-json", filesJson, "--annotations-json", annotationsJson, "--selected-file-path", "src/app.ts", "--search-query", "Check", "--json"],
      ["save-review-workbench-session", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--review-id", "review-1", "--review-type", "code_review", "--title", "Code review", "--files-json", filesJson, "--annotations-json", annotationsJson, "--json"],
      ["load-review-workbench-session", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--review-id", "review-1", "--selected-file-path", "src/app.ts", "--json"],
      ["append-review-workbench-annotation", "--project-id", "project-1", "--workspace-id", "workspace-1", "--trace-id", "trace-1", "--review-id", "review-1", "--file-path", "src/app.ts", "--line-start", "1", "--line-end", "1", "--text", "Needs review", "--severity", "blocking", "--json"],
    ]) {
      await createReportsCommand().parseAsync(args, { from: "user" });
    }

    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/workbench/preview",
        body: {
          projectId: "project-1",
          traceId: "trace-1",
          reviewId: "review-1",
          files: JSON.parse(filesJson),
          annotations: JSON.parse(annotationsJson),
          selectedFilePath: "src/app.ts",
          searchQuery: "Check",
        },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/workbench/session/save",
        body: workflowBody({
          traceId: "trace-1",
          reviewId: "review-1",
          reviewType: "code_review",
          title: "Code review",
          files: JSON.parse(filesJson),
          annotations: JSON.parse(annotationsJson),
        }),
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/workbench/session/load",
        body: workflowBody({ traceId: "trace-1", reviewId: "review-1", selectedFilePath: "src/app.ts" }),
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/workflows/review/workbench/session/annotate",
        body: workflowBody({
          traceId: "trace-1",
          reviewId: "review-1",
          filePath: "src/app.ts",
          lineStart: 1,
          lineEnd: 1,
          text: "Needs review",
          severity: "blocking",
        }),
      },
    ]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function workflowBody(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    workspaceId: "workspace-1",
    workspaceSlug: "workspace-1",
    workspaceName: "Workspace 1",
    projectId: "project-1",
    projectSlug: "project-1",
    projectName: "Project 1",
    ...extra,
  };
}
