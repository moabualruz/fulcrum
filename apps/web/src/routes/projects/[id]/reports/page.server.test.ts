import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// The route delegates project report reads to the report public API
// (`GET /api/v1/reports/projects/:id`) and the QA/review-workbench actions to
// the workflow public API (`POST /workflows/review/...`). Both seams are
// exercised through a fake `event.fetch` plus `FULCRUM_SERVER_URL` — no
// `mock.module`, so sibling route suites sharing the shard never inherit a
// hijacked client.
const ORG_ID = "org-1";
const SERVER_URL = "http://127.0.0.1:3210";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

interface RecordedCall {
  method: string;
  pathname: string;
  search: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

// Maps a workflow public-API pathname to the route-facing method name + the
// canned result shape the route consumes.
const WORKFLOW_ROUTES: Record<string, { method: string; result: Record<string, unknown> }> = {
  "/workflows/review/final-qa/report": { method: "reports.finalQa", result: { status: "passed" } },
  "/workflows/review/final-qa/feedback-gate": { method: "reports.finalQaFeedbackGate", result: { readyForUserAcceptance: true } },
  "/workflows/review/uat-code-review/handoff": { method: "reports.uatCodeReviewHandoff", result: { status: "ready" } },
  "/workflows/review/uat-code-review/decision/record": { method: "reports.recordUatCodeReviewDecision", result: { status: "approved" } },
  "/workflows/review/uat-code-review/decision/apply-configured": { method: "reports.applyConfiguredUatCodeReviewDecision", result: { status: "applied" } },
  "/workflows/review/generated-e2e/run": { method: "reports.runGeneratedE2eRegressionTests", result: { status: "passed" } },
  "/workflows/review/workbench/preview": { method: "reports.reviewWorkbench", result: { files: [] } },
  "/workflows/review/workbench/session/save": { method: "reports.saveReviewWorkbenchSession", result: { reviewId: "review-1", status: "saved" } },
  "/workflows/review/workbench/session/load": { method: "reports.loadReviewWorkbenchSession", result: { reviewId: "review-1", status: "loaded" } },
  "/workflows/review/workbench/session/annotate": { method: "reports.appendReviewWorkbenchAnnotation", result: { reviewId: "review-1", status: "annotated" } },
};

interface FakeFetchOptions {
  /** Non-200 makes `reports.projectPage` reject with the supplied message. */
  projectPageStatus?: number;
}

function fakeFetch(calls: RecordedCall[], options: FakeFetchOptions = {}): typeof fetch {
  const projectPageStatus = options.projectPageStatus ?? 200;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const search = Object.fromEntries(url.searchParams.entries());

    // Report public API: project reports page.
    if (/^\/api\/v1\/reports\/projects\/[^/]+$/.test(url.pathname) && method === "GET") {
      calls.push({ method: "reports.projectPage", pathname: url.pathname, search, body });
      if (projectPageStatus !== 200) {
        return Response.json({ message: "Project not found" }, { status: projectPageStatus });
      }
      const projectId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      return Response.json({
        project: { id: projectId, name: "Project" },
        reports: { sprints: [], burndown: [], velocity: [], cycleTime: { bins: [], p50: 0, p90: 0 }, throughput: [], wip: [], cfd: [] },
        selectedSprintId: search["sprintId"] ?? null,
        orgId: ORG_ID,
      });
    }

    // Workflow public API.
    const workflowRoute = WORKFLOW_ROUTES[url.pathname];
    if (workflowRoute && method === "POST") {
      calls.push({ method: workflowRoute.method, pathname: url.pathname, search, body });
      return Response.json({ projectId: (body as { projectId?: string }).projectId, ...workflowRoute.result });
    }

    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env["FULCRUM_SERVER_URL"] = SERVER_URL;
  delete process.env["FULCRUM_PUBLIC_API_URL"];
});

afterEach(() => {
  if (originalServerUrl === undefined) delete process.env["FULCRUM_SERVER_URL"];
  else process.env["FULCRUM_SERVER_URL"] = originalServerUrl;
  if (originalPublicApiUrl === undefined) delete process.env["FULCRUM_PUBLIC_API_URL"];
  else process.env["FULCRUM_PUBLIC_API_URL"] = originalPublicApiUrl;
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/reports", { method: "POST", body: fd });
}

function loadEvent(id: string, query: string, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/reports${query}`);
  return { params: { id }, url, locals: { orgId: ORG_ID }, request: new Request(url), fetch: fetchImpl };
}

function actionEvent(id: string, request: Request, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/reports`);
  return { params: { id }, url, locals: { orgId: ORG_ID }, request, fetch: fetchImpl };
}

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
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(loadEvent("project-1", "?sprint=sprint-1", fakeFetch(calls)) as Parameters<typeof mod.load>[0]);

    expect(result.project.id).toBe("project-1");
    expect(result.selectedSprintId).toBe("sprint-1");
    expect(calls.map((call) => call.method)).toEqual(["reports.projectPage"]);
    expect(calls[0]!.pathname).toBe("/api/v1/reports/projects/project-1");
    expect(calls[0]!.search).toMatchObject({ sprintId: "sprint-1" });
  });

  test("load propagates public API failure", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(
      mod.load(loadEvent("missing", "", fakeFetch(calls, { projectPageStatus: 404 })) as Parameters<typeof mod.load>[0]),
    ).rejects.toThrow("Project not found");
    expect(calls.map((call) => call.method)).toEqual(["reports.projectPage"]);
    expect(calls[0]!.pathname).toBe("/api/v1/reports/projects/missing");
  });

  test("report workflow actions delegate through workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fetchImpl = fakeFetch(calls);

    await mod.actions.finalQa(actionEvent("project-1", form({ traceId: "trace-1", taskIds: "task-1,task-2" }), fetchImpl) as Parameters<typeof mod.actions.finalQa>[0]);
    await mod.actions.finalQaGate(actionEvent("project-1", form({ maxIterations: "3", copyToWorktree: "a,b" }), fetchImpl) as Parameters<typeof mod.actions.finalQaGate>[0]);
    await mod.actions.uatHandoff(actionEvent("project-1", form({ traceId: "trace-2" }), fetchImpl) as Parameters<typeof mod.actions.uatHandoff>[0]);
    await mod.actions.uatDecision(actionEvent("project-1", form({ decision: "approve_without_manual_review", reviewType: "uat", e2eRunner: "bun" }), fetchImpl) as Parameters<typeof mod.actions.uatDecision>[0]);
    await mod.actions.autoDecision(actionEvent("project-1", form({ traceId: "trace-3" }), fetchImpl) as Parameters<typeof mod.actions.autoDecision>[0]);
    await mod.actions.e2eRun(actionEvent("project-1", form({ runner: "bun", planOnly: "1" }), fetchImpl) as Parameters<typeof mod.actions.e2eRun>[0]);

    expect(calls.map((call) => call.method)).toEqual([
      "reports.finalQa",
      "reports.finalQaFeedbackGate",
      "reports.uatCodeReviewHandoff",
      "reports.recordUatCodeReviewDecision",
      "reports.applyConfiguredUatCodeReviewDecision",
      "reports.runGeneratedE2eRegressionTests",
    ]);
    expect(calls[0]!.body).toMatchObject({ projectId: "project-1", traceId: "trace-1", taskIds: ["task-1", "task-2"] });
    expect(calls[1]!.body).toMatchObject({ maxIterations: 3, copyToWorktree: ["a", "b"] });
    expect(calls[3]!.body).toMatchObject({ decision: "approve_without_manual_review", reviewType: "uat", e2eRunner: "bun" });
    expect(calls[5]!.body).toMatchObject({ runner: "bun", planOnly: true });
  });

  test("review workbench actions delegate through workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const fetchImpl = fakeFetch(calls);

    await mod.actions.reviewWorkbench(actionEvent("project-1", form({ reviewId: "review-1", filesJson: "[]", annotationsJson: "[]" }), fetchImpl) as Parameters<typeof mod.actions.reviewWorkbench>[0]);
    await mod.actions.reviewSessionSave(actionEvent("project-1", form({ reviewId: "review-1", filesJson: "[]", annotationsJson: "[]" }), fetchImpl) as Parameters<typeof mod.actions.reviewSessionSave>[0]);
    await mod.actions.reviewSessionLoad(actionEvent("project-1", form({ reviewId: "review-1" }), fetchImpl) as Parameters<typeof mod.actions.reviewSessionLoad>[0]);
    await mod.actions.reviewSessionAnnotate(
      actionEvent("project-1", form({ reviewId: "review-1", filePath: "src/app.ts", lineStart: "1", lineEnd: "1", annotationText: "fix" }), fetchImpl) as Parameters<typeof mod.actions.reviewSessionAnnotate>[0],
    );

    expect(calls.map((call) => call.method)).toEqual([
      "reports.reviewWorkbench",
      "reports.saveReviewWorkbenchSession",
      "reports.loadReviewWorkbenchSession",
      "reports.appendReviewWorkbenchAnnotation",
    ]);
    expect(calls[0]!.body).toMatchObject({ projectId: "project-1", reviewId: "review-1", files: [], annotations: [] });
    expect(calls[3]!.body).toMatchObject({ projectId: "project-1", reviewId: "review-1", filePath: "src/app.ts", lineStart: 1, lineEnd: 1, text: "fix" });
  });
});
