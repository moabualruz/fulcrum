import { describe, expect, test } from "bun:test";

import { listTraceLinkFields } from "@platform-core/application/interface-parity/trace-link-matrix.ts";
import { withWorkflowApiCaller } from "./local-caller.ts";

describe("CLI workflow API caller", () => {
  test("overlays planning, reports, and workflow-cycle calls with the configured Nest API caller", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const caller = withWorkflowApiCaller({
      planning: {
        previewApprovedPlanBreakdown: async (_input: Record<string, unknown>) => ({ source: "local" }),
      },
      tasks: {
        previewDependencyRun: async (_input: Record<string, unknown>) => ({ source: "local" }),
        dispatchDependencyRun: async (_input: Record<string, unknown>) => ({ source: "local" }),
        dependencyRunLiveFeedback: async (_input: Record<string, unknown>) => ({ source: "local" }),
        dependencyRunLiveFeedbackStream: async (_input: Record<string, unknown>) => ({ source: "local" }),
        runDependencyRunWorkerTick: async (_input: Record<string, unknown>) => ({ source: "local" }),
        recordQaReview: async (_input: Record<string, unknown>) => ({ source: "local" }),
      },
      workflows: {
        runAcceptanceCycle: async (_input: Record<string, unknown>) => ({ source: "local" }),
      },
      reports: {
        finalQa: async (_input: Record<string, unknown>) => ({ source: "local" }),
      },
    }, {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:4321/base/",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/workflows/cycles/acceptance-cycle/run")) {
          return Response.json({ status: "accepted", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/execution/dependency-run/worker-tick")) {
          return Response.json({ claimed: false, traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/execution/dependency-run/preview")) {
          return Response.json({ affectedTaskIds: ["task-1"], traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/execution/dependency-run/dispatch")) {
          return Response.json({ runGroupId: "trace-cli", scheduledRuns: [{ id: "run-1" }], traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/execution/dependency-run/live-feedback/stream")) {
          return new Response([
            "event: feedback",
            "data: {\"traceId\":\"trace-cli\",\"executorStatus\":{\"active\":true}}",
            "",
            "event: feedback",
            "data: {\"traceId\":\"trace-cli\",\"executorStatus\":{\"active\":false}}",
            "",
          ].join("\n"), {
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (String(url).includes("/workflows/execution/dependency-run/live-feedback")) {
          return Response.json({ events: [], traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/execution/qa-review/record")) {
          return Response.json({ status: "needs_feedback", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/review/final-qa/report")) {
          return Response.json({ status: "ready", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/review/final-qa/feedback-gate")) {
          return Response.json({ status: "passed", nextAction: "prompt_uat_code_review", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/review/uat-code-review/handoff")) {
          return Response.json({ status: "ready", nextAction: "prompt_user_for_uat_code_review", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/review/uat-code-review/decision/record")) {
          return Response.json({ status: "approved", nextAction: "real_data_e2e_generated", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/review/uat-code-review/decision/apply-configured")) {
          return Response.json({ status: "applied", nextAction: "real_data_e2e_generated", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/review/generated-e2e/run")) {
          return Response.json({ status: "planned", runner: "playwright", traceId: "trace-cli" });
        }
        if (String(url).includes("/workflows/planning/artifact-execution/run")) {
          return Response.json({ status: "passed", traceId: "trace-cli", runner: "sandbox-agent" });
        }
        return Response.json({ title: "Preview", traceId: "trace-cli" });
      }) as typeof fetch,
    });

    await expect(caller.planning.previewApprovedPlanBreakdown({
      planId: "plan-1",
      approvedPlanMarkdown: "# Plan",
    })).resolves.toEqual({ title: "Preview", traceId: "trace-cli" });
    await expect(caller.tasks.previewDependencyRun({
      mode: "task",
      targetTaskIds: ["task-1"],
      tasks: [],
      traceId: "trace-cli",
    })).resolves.toEqual({ affectedTaskIds: ["task-1"], traceId: "trace-cli" });
    await expect(caller.tasks.dispatchDependencyRun({
      workspaceId: "workspace-1",
      workspaceSlug: "workspace",
      workspaceName: "Workspace",
      projectId: "project-1",
      projectSlug: "project",
      projectName: "Project",
      mode: "task",
      targetTaskIds: ["task-1"],
      traceId: "trace-cli",
      agent: "codex",
    })).resolves.toEqual({ runGroupId: "trace-cli", scheduledRuns: [{ id: "run-1" }], traceId: "trace-cli" });
    await expect(caller.tasks.dependencyRunLiveFeedback({
      projectId: "project-1",
      traceId: "trace-cli",
    })).resolves.toEqual({ events: [], traceId: "trace-cli" });
    await expect(collectStreamEvents(caller.tasks.dependencyRunLiveFeedbackStream({
      projectId: "project-1",
      traceId: "trace-cli",
      runGroupId: "trace-cli",
      once: "1",
    }))).resolves.toEqual([
      { traceId: "trace-cli", executorStatus: { active: true } },
      { traceId: "trace-cli", executorStatus: { active: false } },
    ]);
    await expect(caller.tasks.runDependencyRunWorkerTick({
      projectId: "project-1",
      traceId: "trace-cli",
      workerId: "worker-1",
    })).resolves.toEqual({ claimed: false, traceId: "trace-cli" });
    await expect(caller.tasks.recordQaReview({
      workspaceId: "workspace-1",
      workspaceSlug: "workspace",
      workspaceName: "Workspace",
      projectId: "project-1",
      projectSlug: "project",
      projectName: "Project",
      taskId: "task-1",
      traceId: "trace-cli",
      reviewType: "code",
      reviewText: "Needs one fix.",
    })).resolves.toEqual({ status: "needs_feedback", traceId: "trace-cli" });
    await expect(caller.workflows.runAcceptanceCycle({
      project: { traceId: "trace-cli" },
    })).resolves.toEqual({ status: "accepted", traceId: "trace-cli" });
    await expect(caller.reports.finalQa({
      projectId: "project-1",
      traceId: "trace-cli",
      taskIds: ["task-1"],
    })).resolves.toEqual({ status: "ready", traceId: "trace-cli" });
    await expect(caller.reports.finalQaFeedbackGate({
      projectId: "project-1",
      traceId: "trace-cli",
      taskIds: ["task-1"],
      reviewerAgent: "qa-reviewer",
      copyToWorktree: ["services/planning-review"],
    })).resolves.toEqual({ status: "passed", nextAction: "prompt_uat_code_review", traceId: "trace-cli" });
    await expect(caller.reports.uatCodeReviewHandoff({
      projectId: "project-1",
      traceId: "trace-cli",
      taskIds: ["task-1"],
    })).resolves.toEqual({ status: "ready", nextAction: "prompt_user_for_uat_code_review", traceId: "trace-cli" });
    await expect(caller.reports.recordUatCodeReviewDecision({
      projectId: "project-1",
      traceId: "trace-cli",
      taskIds: ["task-1"],
      decision: "approve_without_manual_review",
      reviewType: "uat",
      e2eRunner: "playwright",
    })).resolves.toEqual({ status: "approved", nextAction: "real_data_e2e_generated", traceId: "trace-cli" });
    await expect(caller.reports.applyConfiguredUatCodeReviewDecision({
      projectId: "project-1",
      traceId: "trace-cli",
      taskIds: ["task-1"],
    })).resolves.toEqual({ status: "applied", nextAction: "real_data_e2e_generated", traceId: "trace-cli" });
    await expect(caller.reports.runGeneratedE2eRegressionTests({
      projectId: "project-1",
      traceId: "trace-cli",
      taskIds: ["task-1"],
      runner: "playwright",
      planOnly: true,
    })).resolves.toEqual({ status: "planned", runner: "playwright", traceId: "trace-cli" });
    await expect(caller.planning.runArtifactExecution({
      planId: "plan-1",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      traceId: "trace-cli",
    })).resolves.toEqual({ status: "passed", traceId: "trace-cli", runner: "sandbox-agent" });

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:4321/workflows/planning/approved-plan/preview",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/preview",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/dispatch",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/live-feedback",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/live-feedback/stream?projectId=project-1&traceId=trace-cli&runGroupId=trace-cli&once=1",
      "http://127.0.0.1:4321/workflows/execution/dependency-run/worker-tick",
      "http://127.0.0.1:4321/workflows/execution/qa-review/record",
      "http://127.0.0.1:4321/workflows/cycles/acceptance-cycle/run",
      "http://127.0.0.1:4321/workflows/review/final-qa/report",
      "http://127.0.0.1:4321/workflows/review/final-qa/feedback-gate",
      "http://127.0.0.1:4321/workflows/review/uat-code-review/handoff",
      "http://127.0.0.1:4321/workflows/review/uat-code-review/decision/record",
      "http://127.0.0.1:4321/workflows/review/uat-code-review/decision/apply-configured",
      "http://127.0.0.1:4321/workflows/review/generated-e2e/run",
      "http://127.0.0.1:4321/workflows/planning/artifact-execution/run",
    ]);

    expect(listTraceLinkFields().map((field) => field.name)).toEqual(expect.arrayContaining([
      "projectId",
      "taskId",
      "runId",
      "traceId",
      "runGroupId",
      "reviewId",
      "docId",
      "artifactId",
      "memoryId",
    ]));
  });
});

async function collectStreamEvents(stream: {
  subscribe(observer: {
    next(value: unknown): void;
    error?(error: unknown): void;
    complete?(): void;
  }): { unsubscribe?(): void };
}): Promise<unknown[]> {
  return await new Promise((resolve, reject) => {
    const events: unknown[] = [];
    stream.subscribe({
      next(value) {
        events.push(value);
      },
      error: reject,
      complete() {
        resolve(events);
      },
    });
  });
}
