import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// The route delegates project existence to the project public API
// (`GET /api/v1/projects/:id`) and the UAT handoff/decision to the workflow
// public API (`POST /workflows/review/uat-code-review/...`). Both seams are
// exercised through a fake `event.fetch` plus `FULCRUM_SERVER_URL` — no
// `mock.module`, so sibling route suites in the same shard are never hijacked.
const ORG_ID = "org-1";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const SERVER_URL = "http://127.0.0.1:3210";

interface RecordedCall {
  method: string;
  pathname: string;
  body: unknown;
}

interface FakeFetchOptions {
  /** Status returned by the handoff endpoint; non-200 triggers `WorkflowApiError`. */
  handoffStatus?: number;
  handoffBody?: unknown;
  decisionStatus?: string;
}

function fakeFetch(calls: RecordedCall[], options: FakeFetchOptions = {}): typeof fetch {
  const handoffStatus = options.handoffStatus ?? 200;
  const decisionStatus = options.decisionStatus ?? "approved";

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    // Project existence guard.
    const parts = url.pathname.split("/").filter(Boolean); // api v1 projects :id
    if (parts.length === 4 && parts[2] === "projects" && method === "GET") {
      calls.push({ method: "ensureProjectExists", pathname: url.pathname, body: decodeURIComponent(parts[3]!) });
      return Response.json({ id: decodeURIComponent(parts[3]!), name: "Project 1" });
    }

    if (url.pathname === "/workflows/review/uat-code-review/handoff" && method === "POST") {
      calls.push({ method: "reports.uatCodeReviewHandoff", pathname: url.pathname, body });
      if (handoffStatus !== 200) {
        return Response.json(options.handoffBody ?? { message: "Project not found" }, { status: handoffStatus });
      }
      return Response.json({
        projectId: (body as { projectId: string }).projectId,
        status: "ready",
        finalQaStatus: "passed",
        nextAction: "prompt_user_for_uat_code_review",
        decisionOptions: [
          { id: "approve_without_manual_review", label: "Approve", description: "Approve." },
          { id: "request_changes", label: "Request Changes", description: "Send feedback." },
        ],
        promptMarkdown: "# UAT Prompt",
      });
    }

    if (url.pathname === "/workflows/review/uat-code-review/decision/record" && method === "POST") {
      calls.push({ method: "reports.recordUatCodeReviewDecision", pathname: url.pathname, body });
      return Response.json({ projectId: (body as { projectId: string }).projectId, status: decisionStatus });
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

function loadEvent(id: string, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/uat`);
  return { params: { id }, url, locals: { orgId: ORG_ID }, request: new Request(url), fetch: fetchImpl };
}

function actionEvent(id: string, data: Record<string, string>, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/uat`);
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    params: { id },
    url,
    locals: { orgId: ORG_ID },
    request: new Request(url, { method: "POST", body: fd }),
    fetch: fetchImpl,
  };
}

describe("/projects/[id]/uat +page.server.ts", () => {
  test("server route uses project and workflow public APIs instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("ensureProjectExists");
    expect(source).toContain("createWebWorkflowApiCaller");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@planning-review/interface/project-review-reports");
  });

  test("load returns handoff data for a project", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(loadEvent("project-1", fakeFetch(calls)) as Parameters<typeof mod.load>[0]);

    expect(result.projectId).toBe("project-1");
    expect(result.handoff).toMatchObject({ projectId: "project-1", status: "ready", finalQaStatus: "passed" });
    expect(calls.map((call) => call.method)).toEqual([
      "ensureProjectExists",
      "reports.uatCodeReviewHandoff",
    ]);
    expect(calls[0]!.body).toBe("project-1");
    expect(calls[1]!.body).toMatchObject({ projectId: "project-1", workspaceId: "org-1" });
  });

  test("load returns null handoff on non-404 workflow error", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(
      loadEvent("project-1", fakeFetch(calls, { handoffStatus: 500, handoffBody: { message: "handoff not ready" } })) as Parameters<typeof mod.load>[0],
    );

    expect(result).toEqual({ projectId: "project-1", handoff: null });
    expect(calls.map((call) => call.method)).toEqual(["ensureProjectExists", "reports.uatCodeReviewHandoff"]);
  });

  test("load throws 404 for public API not-found handoff", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    await expect(
      mod.load(
        loadEvent("missing", fakeFetch(calls, { handoffStatus: 404, handoffBody: { message: "Project not found" } })) as Parameters<typeof mod.load>[0],
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("decide action records approval and returns redirect to reports", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.decide(
      actionEvent(
        "project-1",
        {
          decision: "approve_without_manual_review",
          traceId: "trace-1",
          feedbackText: "ship it",
          taskIds: "task-1,task-2",
        },
        fakeFetch(calls, { decisionStatus: "approved" }),
      ) as Parameters<typeof mod.actions.decide>[0],
    );

    expect(result).toMatchObject({ ok: true, mode: "decide", decision: { status: "approved" }, redirectTo: "/projects/project-1/reports" });
    expect(calls.map((call) => call.method)).toEqual(["reports.recordUatCodeReviewDecision"]);
    expect(calls[0]!.body).toMatchObject({
      projectId: "project-1",
      traceId: "trace-1",
      decision: "approve_without_manual_review",
      reviewType: "uat",
      feedbackText: "ship it",
      taskIds: ["task-1", "task-2"],
    });
  });

  test("decide action records request_changes and returns redirect to review", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.actions.decide(
      actionEvent("project-1", { decision: "request_changes" }, fakeFetch(calls, { decisionStatus: "changes_requested" })) as Parameters<typeof mod.actions.decide>[0],
    );

    expect(result).toMatchObject({ ok: true, mode: "decide", decision: { status: "changes_requested" }, redirectTo: "/projects/project-1/review" });
    expect(calls[0]).toMatchObject({
      method: "reports.recordUatCodeReviewDecision",
      body: { projectId: "project-1", decision: "request_changes", reviewType: "uat" },
    });
  });

  test("decide action returns error on invalid decision", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const result = await mod.actions.decide(
      actionEvent("project-1", { decision: "maybe" }, fakeFetch(calls)) as Parameters<typeof mod.actions.decide>[0],
    ) as { status: number; data: unknown };

    expect(result.status).toBe(400);
    expect(result.data).toEqual({ ok: false, mode: "decide", message: "Unsupported UAT decision: maybe" });
    expect(calls).toEqual([]);
  });

  test("decide action defaults to approve_without_manual_review when empty", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);
    await mod.actions.decide(
      actionEvent("project-1", { decision: "" }, fakeFetch(calls)) as Parameters<typeof mod.actions.decide>[0],
    );

    expect(calls.map((call) => call.method)).toEqual(["reports.recordUatCodeReviewDecision"]);
    expect(calls[0]!.body).toMatchObject({
      projectId: "project-1",
      decision: "approve_without_manual_review",
      reviewType: "uat",
      taskIds: [],
    });
  });
});
