import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";

const calls: string[] = [];
let loadShouldThrowNotFound = false;

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/reports", { method: "POST", body: fd });
}

mock.module("$lib/server/application-scope", () => ({
  requestAppScope: async (_locals: unknown, projectId: string | null) => ({
    em: { kind: "mock-em" },
    ctx: { orgId: "org-1", userId: "user-1", projectId },
  }),
}));

mock.module("@work-management/interface/project-reports.ts", () => ({
  loadProjectReportsPage: async (_em: unknown, _ctx: unknown, input: { projectId: string; sprintId?: string }) => {
    calls.push(`load:${input.projectId}:${input.sprintId ?? ""}`);
    if (loadShouldThrowNotFound) throw new AppNotFoundError("Project not found");
    return {
      project: { id: input.projectId, name: "Project" },
      reports: { sprints: [], burndown: [], velocity: [], cycleTime: { bins: [], p50: 0, p90: 0 }, throughput: [], wip: [], cfd: [] },
      selectedSprintId: input.sprintId ?? null,
      orgId: "org-1",
    };
  },
}));

mock.module("@planning-review/interface/project-review-reports.ts", () => ({
  buildFinalQaReport: async (_em: unknown, _ctx: unknown, input: { projectId: string; traceId?: string }) => {
    calls.push(`final-qa:${input.projectId}:${input.traceId ?? ""}`);
    return { projectId: input.projectId, traceId: input.traceId, status: "passed" };
  },
  buildFinalQaFeedbackGate: async (_em: unknown, _ctx: unknown, input: { projectId: string; maxIterations?: number }) => {
    calls.push(`final-gate:${input.projectId}:${input.maxIterations ?? ""}`);
    return { projectId: input.projectId, readyForUserAcceptance: true };
  },
  buildUatCodeReviewHandoff: async (_em: unknown, _ctx: unknown, input: { projectId: string; traceId?: string }) => {
    calls.push(`handoff:${input.projectId}:${input.traceId ?? ""}`);
    return { projectId: input.projectId, status: "ready" };
  },
  recordUatCodeReviewDecision: async (_em: unknown, _ctx: unknown, input: { projectId: string; decision: string; reviewType: string }) => {
    calls.push(`decision:${input.projectId}:${input.decision}:${input.reviewType}`);
    return { projectId: input.projectId, status: "approved" };
  },
  applyConfiguredUatCodeReviewDecision: async (_em: unknown, _ctx: unknown, input: { projectId: string; traceId?: string }) => {
    calls.push(`auto:${input.projectId}:${input.traceId ?? ""}`);
    return { projectId: input.projectId, status: "applied" };
  },
  runGeneratedE2eRegressionTests: async (_em: unknown, _ctx: unknown, input: { projectId: string; runner?: string; planOnly?: boolean }) => {
    calls.push(`e2e:${input.projectId}:${input.runner ?? ""}:${input.planOnly ? "plan" : "run"}`);
    return { projectId: input.projectId, status: input.planOnly ? "planned" : "passed" };
  },
  buildReviewWorkbenchModel: async (input: { projectId?: string; reviewId?: string }) => {
    calls.push(`workbench:${input.projectId ?? ""}:${input.reviewId ?? ""}`);
    return { projectId: input.projectId, reviewId: input.reviewId, files: [] };
  },
  saveReviewWorkbenchSession: async (_em: unknown, _ctx: unknown, input: { projectId: string; reviewId?: string }) => {
    calls.push(`save:${input.projectId}:${input.reviewId ?? ""}`);
    return { projectId: input.projectId, reviewId: input.reviewId ?? "review-1", status: "saved" };
  },
  loadReviewWorkbenchSession: async (_em: unknown, _ctx: unknown, input: { projectId: string; reviewId?: string }) => {
    calls.push(`session-load:${input.projectId}:${input.reviewId ?? ""}`);
    return { projectId: input.projectId, reviewId: input.reviewId ?? "review-1", status: "loaded" };
  },
  appendReviewWorkbenchAnnotation: async (_em: unknown, _ctx: unknown, input: { projectId: string; reviewId?: string; filePath: string }) => {
    calls.push(`annotate:${input.projectId}:${input.reviewId ?? ""}:${input.filePath}`);
    return { projectId: input.projectId, reviewId: input.reviewId ?? "review-1", status: "annotated" };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
  loadShouldThrowNotFound = false;
});

describe("/projects/[id]/reports +page.server.ts", () => {
  test("server route uses service interfaces instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/project-reports");
    expect(source).toContain("@planning-review/interface/project-review-reports");
    expect(source).toContain("$lib/server/request-service-scope");
    expect(source).not.toContain("@work-management/application/");
    expect(source).not.toContain("@planning-review/application/");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load maps project reports and preserves not-found behavior", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      url: new URL("http://localhost/projects/project-1/reports?sprint=sprint-1"),
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.project.id).toBe("project-1");
    expect(result.selectedSprintId).toBe("sprint-1");
    expect(calls).toEqual(["load:project-1:sprint-1"]);

    calls.splice(0, calls.length);
    loadShouldThrowNotFound = true;
    await expect(mod.load({
      params: { id: "missing" },
      url: new URL("http://localhost/projects/missing/reports"),
      locals: {},
    } as Parameters<typeof mod.load>[0])).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual(["load:missing:"]);
  });

  test("report workflow actions delegate through planning-review boundaries", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const base = { params: { id: "project-1" }, locals: {} };

    await mod.actions.finalQa({ ...base, request: form({ traceId: "trace-1" }) } as Parameters<typeof mod.actions.finalQa>[0]);
    await mod.actions.finalQaGate({ ...base, request: form({ maxIterations: "3" }) } as Parameters<typeof mod.actions.finalQaGate>[0]);
    await mod.actions.uatHandoff({ ...base, request: form({ traceId: "trace-2" }) } as Parameters<typeof mod.actions.uatHandoff>[0]);
    await mod.actions.uatDecision({ ...base, request: form({ decision: "approve_without_manual_review", reviewType: "uat" }) } as Parameters<typeof mod.actions.uatDecision>[0]);
    await mod.actions.autoDecision({ ...base, request: form({ traceId: "trace-3" }) } as Parameters<typeof mod.actions.autoDecision>[0]);
    await mod.actions.e2eRun({ ...base, request: form({ runner: "bun", planOnly: "1" }) } as Parameters<typeof mod.actions.e2eRun>[0]);

    expect(calls).toEqual([
      "final-qa:project-1:trace-1",
      "final-gate:project-1:3",
      "handoff:project-1:trace-2",
      "decision:project-1:approve_without_manual_review:uat",
      "auto:project-1:trace-3",
      "e2e:project-1:bun:plan",
    ]);
  });

  test("review workbench actions delegate through planning-review boundaries", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const base = { params: { id: "project-1" }, locals: {} };

    await mod.actions.reviewWorkbench({ ...base, request: form({ reviewId: "review-1", filesJson: "[]", annotationsJson: "[]" }) } as Parameters<typeof mod.actions.reviewWorkbench>[0]);
    await mod.actions.reviewSessionSave({ ...base, request: form({ reviewId: "review-1", filesJson: "[]", annotationsJson: "[]" }) } as Parameters<typeof mod.actions.reviewSessionSave>[0]);
    await mod.actions.reviewSessionLoad({ ...base, request: form({ reviewId: "review-1" }) } as Parameters<typeof mod.actions.reviewSessionLoad>[0]);
    await mod.actions.reviewSessionAnnotate({
      ...base,
      request: form({ reviewId: "review-1", filePath: "src/app.ts", lineStart: "1", lineEnd: "1", annotationText: "fix" }),
    } as Parameters<typeof mod.actions.reviewSessionAnnotate>[0]);

    expect(calls).toEqual([
      "workbench:project-1:review-1",
      "save:project-1:review-1",
      "session-load:project-1:review-1",
      "annotate:project-1:review-1:src/app.ts",
    ]);
  });
});
