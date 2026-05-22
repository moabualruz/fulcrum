import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];
let projectPageShouldFail = false;

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/reports", { method: "POST", body: fd });
}

mock.module("$lib/server/report-api", () => ({
  createReportApiForEvent: () => ({
    reports: {
      projectPage: async (input: unknown) => {
        calls.push({ method: "reports.projectPage", input });
        if (projectPageShouldFail) throw new Error("Project not found");
        const projectId = (input as { projectId: string }).projectId;
        return {
          project: { id: projectId, name: "Project" },
          reports: { sprints: [], burndown: [], velocity: [], cycleTime: { bins: [], p50: 0, p90: 0 }, throughput: [], wip: [], cfd: [] },
          selectedSprintId: (input as { sprintId?: string }).sprintId ?? null,
          orgId: "org-1",
        };
      },
    },
  }),
}));

mock.module("$lib/server/workflow-api", () => ({
  webWorkflowApiUrl: () => null,
  workflowApiProjectMetadata: (_event: unknown, projectId: string) => ({ orgId: "org-1", userId: "user-1", projectId }),
  createWebWorkflowApiCaller: () => ({
    reports: {
      finalQa: async (input: unknown) => record("reports.finalQa", input, { status: "passed" }),
      finalQaFeedbackGate: async (input: unknown) => record("reports.finalQaFeedbackGate", input, { readyForUserAcceptance: true }),
      uatCodeReviewHandoff: async (input: unknown) => record("reports.uatCodeReviewHandoff", input, { status: "ready" }),
      recordUatCodeReviewDecision: async (input: unknown) => record("reports.recordUatCodeReviewDecision", input, { status: "approved" }),
      applyConfiguredUatCodeReviewDecision: async (input: unknown) => record("reports.applyConfiguredUatCodeReviewDecision", input, { status: "applied" }),
      runGeneratedE2eRegressionTests: async (input: unknown) => record("reports.runGeneratedE2eRegressionTests", input, { status: "passed" }),
      reviewWorkbench: async (input: unknown) => record("reports.reviewWorkbench", input, { files: [] }),
      saveReviewWorkbenchSession: async (input: unknown) => record("reports.saveReviewWorkbenchSession", input, { reviewId: "review-1", status: "saved" }),
      loadReviewWorkbenchSession: async (input: unknown) => record("reports.loadReviewWorkbenchSession", input, { reviewId: "review-1", status: "loaded" }),
      appendReviewWorkbenchAnnotation: async (input: unknown) => record("reports.appendReviewWorkbenchAnnotation", input, { reviewId: "review-1", status: "annotated" }),
    },
  }),
}));

function record(method: string, input: unknown, result: Record<string, unknown>) {
  calls.push({ method, input });
  return { projectId: (input as { projectId?: string }).projectId, ...result };
}

beforeEach(() => {
  calls.splice(0, calls.length);
  projectPageShouldFail = false;
});

describe("/projects/[id]/reports +page.server.ts", () => {
  test("server route uses report and workflow public APIs instead of application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createReportApiForEvent");
    expect(source).toContain("createWebWorkflowApiCaller");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("$lib/server/application-scope");
    expect(source).not.toContain("@planning-review/interface/project-review-reports");
  });

  test("load maps project reports and preserves sprint filter delegation", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      url: new URL("http://localhost/projects/project-1/reports?sprint=sprint-1"),
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.project.id).toBe("project-1");
    expect(result.selectedSprintId).toBe("sprint-1");
    expect(calls).toEqual([{ method: "reports.projectPage", input: { projectId: "project-1", sprintId: "sprint-1" } }]);
  });

  test("load propagates public API failure", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    projectPageShouldFail = true;
    await expect(mod.load({
      params: { id: "missing" },
      url: new URL("http://localhost/projects/missing/reports"),
      locals: {},
    } as Parameters<typeof mod.load>[0])).rejects.toThrow("Project not found");
    expect(calls).toEqual([{ method: "reports.projectPage", input: { projectId: "missing", sprintId: undefined } }]);
  });

  test("report workflow actions delegate through workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const base = { params: { id: "project-1" }, locals: {} };

    await mod.actions.finalQa({ ...base, request: form({ traceId: "trace-1", taskIds: "task-1,task-2" }) } as Parameters<typeof mod.actions.finalQa>[0]);
    await mod.actions.finalQaGate({ ...base, request: form({ maxIterations: "3", copyToWorktree: "a,b" }) } as Parameters<typeof mod.actions.finalQaGate>[0]);
    await mod.actions.uatHandoff({ ...base, request: form({ traceId: "trace-2" }) } as Parameters<typeof mod.actions.uatHandoff>[0]);
    await mod.actions.uatDecision({ ...base, request: form({ decision: "approve_without_manual_review", reviewType: "uat", e2eRunner: "bun" }) } as Parameters<typeof mod.actions.uatDecision>[0]);
    await mod.actions.autoDecision({ ...base, request: form({ traceId: "trace-3" }) } as Parameters<typeof mod.actions.autoDecision>[0]);
    await mod.actions.e2eRun({ ...base, request: form({ runner: "bun", planOnly: "1" }) } as Parameters<typeof mod.actions.e2eRun>[0]);

    expect(calls.map((call) => call.method)).toEqual([
      "reports.finalQa",
      "reports.finalQaFeedbackGate",
      "reports.uatCodeReviewHandoff",
      "reports.recordUatCodeReviewDecision",
      "reports.applyConfiguredUatCodeReviewDecision",
      "reports.runGeneratedE2eRegressionTests",
    ]);
    expect(calls[0].input).toMatchObject({ projectId: "project-1", traceId: "trace-1", taskIds: ["task-1", "task-2"] });
    expect(calls[1].input).toMatchObject({ maxIterations: 3, copyToWorktree: ["a", "b"] });
    expect(calls[3].input).toMatchObject({ decision: "approve_without_manual_review", reviewType: "uat", e2eRunner: "bun" });
    expect(calls[5].input).toMatchObject({ runner: "bun", planOnly: true });
  });

  test("review workbench actions delegate through workflow public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const base = { params: { id: "project-1" }, locals: {} };

    await mod.actions.reviewWorkbench({ ...base, request: form({ reviewId: "review-1", filesJson: "[]", annotationsJson: "[]" }) } as Parameters<typeof mod.actions.reviewWorkbench>[0]);
    await mod.actions.reviewSessionSave({ ...base, request: form({ reviewId: "review-1", filesJson: "[]", annotationsJson: "[]" }) } as Parameters<typeof mod.actions.reviewSessionSave>[0]);
    await mod.actions.reviewSessionLoad({ ...base, request: form({ reviewId: "review-1" }) } as Parameters<typeof mod.actions.reviewSessionLoad>[0]);
    await mod.actions.reviewSessionAnnotate({
      ...base,
      request: form({ reviewId: "review-1", filePath: "src/app.ts", lineStart: "1", lineEnd: "1", annotationText: "fix" }),
    } as Parameters<typeof mod.actions.reviewSessionAnnotate>[0]);

    expect(calls.map((call) => call.method)).toEqual([
      "reports.reviewWorkbench",
      "reports.saveReviewWorkbenchSession",
      "reports.loadReviewWorkbenchSession",
      "reports.appendReviewWorkbenchAnnotation",
    ]);
    expect(calls[0].input).toMatchObject({ projectId: "project-1", reviewId: "review-1", files: [], annotations: [] });
    expect(calls[3].input).toMatchObject({ projectId: "project-1", reviewId: "review-1", filePath: "src/app.ts", lineStart: 1, lineEnd: 1, text: "fix" });
  });
});
