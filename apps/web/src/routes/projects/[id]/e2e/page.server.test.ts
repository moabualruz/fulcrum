import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// The route delegates generated-E2E history and runs to the workflow public
// API (`POST /workflows/review/generated-e2e/...`). The seam is exercised
// through a fake `event.fetch` plus `FULCRUM_SERVER_URL` — no `mock.module`,
// so sibling route suites sharing the shard never inherit a hijacked client.
const ORG_ID = "org-1";
const SERVER_URL = "http://127.0.0.1:3210";
const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

interface RecordedCall {
  method: string;
  pathname: string;
  body: Record<string, unknown>;
}

interface FakeFetchOptions {
  /** Non-200 history status makes the route fall back to an empty list. */
  historyStatus?: number;
  /** Non-200 run status surfaces a `WorkflowApiError` with that status. */
  runStatus?: number;
  runBody?: unknown;
}

function fakeFetch(calls: RecordedCall[], options: FakeFetchOptions = {}): typeof fetch {
  const historyStatus = options.historyStatus ?? 200;
  const runStatus = options.runStatus ?? 200;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (url.pathname === "/workflows/review/generated-e2e/history" && method === "POST") {
      calls.push({ method: "reports.listGeneratedE2eRuns", pathname: url.pathname, body });
      if (historyStatus !== 200) return Response.json({ message: "history unavailable" }, { status: historyStatus });
      return Response.json([{ id: "e2e-1", runner: "bun", status: "passed" }]);
    }

    if (url.pathname === "/workflows/review/generated-e2e/run" && method === "POST") {
      calls.push({ method: "reports.runGeneratedE2eRegressionTests", pathname: url.pathname, body });
      if (runStatus !== 200) return Response.json(options.runBody ?? { message: "No tests generated" }, { status: runStatus });
      return Response.json({ id: "e2e-2", status: "queued" });
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
  return new Request("http://localhost/projects/project-1/e2e", { method: "POST", body: fd });
}

function loadEvent(id: string, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/e2e`);
  return { params: { id }, url, locals: { orgId: ORG_ID }, request: new Request(url), fetch: fetchImpl };
}

function actionEvent(id: string, request: Request, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/e2e`);
  return { params: { id }, url, locals: { orgId: ORG_ID }, request, fetch: fetchImpl };
}

describe("/projects/[id]/e2e +page.server.ts", () => {
  test("server route uses the workflow public API instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createWebWorkflowApiCaller");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@planning-review/interface/project-review-reports");
  });

  test("load returns generated e2e history from workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(loadEvent("project-1", fakeFetch(calls)) as Parameters<typeof mod.load>[0]);

    expect(result).toEqual({ projectId: "project-1", history: [{ id: "e2e-1", runner: "bun", status: "passed" }] });
    expect(calls.map((call) => call.method)).toEqual(["reports.listGeneratedE2eRuns"]);
    expect(calls[0]!.body).toMatchObject({ projectId: "project-1", limit: 20 });
  });

  test("load returns empty history when workflow history fails", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(
      loadEvent("project-1", fakeFetch(calls, { historyStatus: 500 })) as Parameters<typeof mod.load>[0],
    );

    expect(result).toEqual({ projectId: "project-1", history: [] });
    expect(calls.map((call) => call.method)).toEqual(["reports.listGeneratedE2eRuns"]);
  });

  test("runE2e delegates runner, trace, and file filters to workflow public API", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.runE2e(
      actionEvent("project-1", form({ runner: "playwright", traceId: "trace-1", testFiles: "a.spec.ts, b.spec.ts" }), fakeFetch(calls)) as Parameters<
        typeof mod.actions.runE2e
      >[0],
    );

    expect(result).toEqual({ ok: true, mode: "runE2e", result: { id: "e2e-2", status: "queued" } });
    expect(calls.map((call) => call.method)).toEqual(["reports.runGeneratedE2eRegressionTests"]);
    expect(calls[0]!.body).toMatchObject({
      projectId: "project-1",
      runner: "playwright",
      traceId: "trace-1",
      testFiles: ["a.spec.ts", "b.spec.ts"],
    });
  });

  test("runE2e validates runner before delegating", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.runE2e(
      actionEvent("project-1", form({ runner: "vitest" }), fakeFetch(calls)) as Parameters<typeof mod.actions.runE2e>[0],
    ) as { status: number; data: unknown };

    expect(result.status).toBe(400);
    expect(result.data).toEqual({ ok: false, error: "runner must be bun or playwright" });
    expect(calls).toEqual([]);
  });

  test("runE2e preserves public API error status", async () => {
    const calls: RecordedCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.actions.runE2e(
      actionEvent(
        "project-1",
        form({ runner: "bun" }),
        fakeFetch(calls, { runStatus: 422, runBody: { message: "No tests generated" } }),
      ) as Parameters<typeof mod.actions.runE2e>[0],
    ) as { status: number; data: unknown };

    expect(result.status).toBe(422);
    expect(result.data).toEqual({ ok: false, error: "No tests generated" });
  });
});
