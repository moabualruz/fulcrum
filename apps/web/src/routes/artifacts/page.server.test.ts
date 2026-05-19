import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface ArtifactRow {
  id: string;
  project_id: string | null;
  run_id: string | null;
  task_id: string | null;
  trace_id: string | null;
  doc_id: string | null;
  kind: string;
  title: string;
  mime: string | null;
  archived: boolean;
  size: number | null;
  created_at: string;
}

interface ArtifactsPayload {
  artifacts: ArtifactRow[];
  error?: {
    message: string;
    recovery: string;
    traceId: string;
  } | null;
}

interface PublicArtifactRow {
  id: string;
  projectId: string | null;
  traceId: string | null;
  runId: string | null;
  taskId: string | null;
  docId: string | null;
  kind: string;
  title: string;
  filename: string | null;
  bodyPath: string | null;
  checksumSha256: string | null;
  sizeBytes: string | number | null;
  mime: string | null;
  archived: boolean;
  createdAt: string;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function eventFor(
  path: string,
  fetchImpl: typeof fetch = fetchArtifacts(),
): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL(path, "http://localhost");
  return {
    url,
    locals: { activeProjectId: null, orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function actionEventFor(form: FormData, fetchImpl: typeof fetch): Parameters<typeof import("./+page.server.ts").actions.bulk>[0] {
  const url = new URL("http://localhost/artifacts");
  return {
    url,
    locals: { activeProjectId: null, orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { method: "POST", body: form, headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").actions.bulk>[0];
}

function fetchArtifacts(calls: string[] = [], seed: PublicArtifactRow[] = defaultArtifacts()): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push(`${method} ${url.pathname}${url.search} ${headers.get("cookie") ?? ""}`);

    if (url.pathname !== "/api/v1/artifacts" || method !== "GET") {
      return Response.json({ message: `unexpected ${method} ${url.pathname}${url.search}` }, { status: 500 });
    }

    const mime = url.searchParams.get("mime");
    const kind = url.searchParams.get("kind");
    const projectId = url.searchParams.get("projectId");
    const runId = url.searchParams.get("runId");
    const taskId = url.searchParams.get("taskId");
    const traceId = url.searchParams.get("traceId");
    const archived = url.searchParams.get("archived");
    const rows = seed.filter((artifact) => {
      if (mime && artifact.mime !== mime) return false;
      if (kind && artifact.kind !== kind) return false;
      if (projectId && artifact.projectId !== projectId) return false;
      if (runId && artifact.runId !== runId) return false;
      if (taskId && artifact.taskId !== taskId) return false;
      if (traceId && artifact.traceId !== traceId) return false;
      if (archived === "false" && artifact.archived) return false;
      return true;
    });
    return Response.json(rows);
  }) as typeof fetch;
}

function fetchArtifactMutations(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push(`${method} ${url.pathname} ${headers.get("cookie") ?? ""}`);

    if (url.pathname === "/api/v1/artifacts" && method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      return Response.json({
        id: "artifact-uploaded",
        projectId: body["projectId"],
        traceId: body["traceId"],
        runId: body["runId"] ?? null,
        taskId: body["taskId"] ?? null,
        docId: body["docId"] ?? null,
        kind: body["kind"] ?? "file",
        title: body["title"] ?? body["filename"],
        filename: body["filename"],
        bodyPath: body["bodyPath"] ?? null,
        checksumSha256: null,
        sizeBytes: body["sizeBytes"],
        mime: body["mime"],
        archived: false,
        createdAt: "2026-05-15T11:00:00.000Z",
      });
    }

    if (url.pathname.endsWith("/archive") && method === "POST") {
      return Response.json({ ...defaultArtifacts()[0], archived: true });
    }
    if (url.pathname.startsWith("/api/v1/artifacts/") && method === "DELETE") {
      return Response.json({ ok: true, id: url.pathname.split("/").at(-1) });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

function formFor(action: string, ids: string[]): FormData {
  const form = new FormData();
  form.set("action", action);
  form.set("ids", JSON.stringify(ids));
  return form;
}

function defaultArtifacts(): PublicArtifactRow[] {
  return [
    {
      id: "artifact-report",
      projectId: "project-1",
      traceId: "trace-1",
      runId: "run-1",
      taskId: "task-1",
      docId: null,
      kind: "file",
      title: "report.md",
      filename: "report.md",
      bodyPath: "artifacts/report.md",
      checksumSha256: "sha-report",
      sizeBytes: "2048",
      mime: "text/plain",
      archived: false,
      createdAt: "2026-05-15T10:00:00.000Z",
    },
    {
      id: "artifact-data",
      projectId: "project-1",
      traceId: "trace-2",
      runId: null,
      taskId: null,
      docId: "doc-1",
      kind: "report",
      title: "data.json",
      filename: "data.json",
      bodyPath: "artifacts/data.json",
      checksumSha256: "sha-data",
      sizeBytes: 512,
      mime: "application/json",
      archived: false,
      createdAt: "2026-05-15T10:01:00.000Z",
    },
    {
      id: "artifact-archived",
      projectId: "project-1",
      traceId: "trace-3",
      runId: null,
      taskId: null,
      docId: null,
      kind: "file",
      title: "old.md",
      filename: "old.md",
      bodyPath: "artifacts/old.md",
      checksumSha256: null,
      sizeBytes: null,
      mime: "text/plain",
      archived: true,
      createdAt: "2026-05-15T10:02:00.000Z",
    },
  ];
}

describe("/artifacts +page.server.ts load()", () => {
  test("server route uses the artifact public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createArtifactApiForEvent");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("@workflow-coordination/application/artifacts");
  });

  test("returns artifacts unfiltered except archived by default", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("/artifacts", fetchArtifacts(calls)));
    const payload = await streamedData<ArtifactsPayload>(result);

    expect(payload.artifacts.map((artifact) => artifact.id)).toEqual(["artifact-report", "artifact-data"]);
    expect(payload.artifacts[0]).toMatchObject({
      project_id: "project-1",
      run_id: "run-1",
      task_id: "task-1",
      trace_id: "trace-1",
      doc_id: null,
      body_path: "artifacts/report.md",
      sha256: "sha-report",
      size: 2048,
      created_at: "2026-05-15T10:00:00.000Z",
    });
    expect(calls).toEqual(["GET /api/v1/artifacts?archived=false sid=test-session"]);
  });

  test("mime filter narrows results", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(eventFor("/artifacts?mime=application/json"));
    const payload = await streamedData<ArtifactsPayload>(result);
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]!.mime).toBe("application/json");
  });

  test("kind, project, run, task, and trace filters are passed to public API", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(eventFor("/artifacts?kind=file&project=project-1&run=run-1&task=task-1&trace=trace-1", fetchArtifacts(calls)));
    const payload = await streamedData<ArtifactsPayload>(result);

    expect(payload.artifacts.map((artifact) => artifact.id)).toEqual(["artifact-report"]);
    expect(calls).toEqual(["GET /api/v1/artifacts?projectId=project-1&traceId=trace-1&kind=file&runId=run-1&taskId=task-1&archived=false sid=test-session"]);
  });

  test("archived=true includes archived results", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(eventFor("/artifacts?archived=true"));
    const payload = await streamedData<ArtifactsPayload>(result);
    expect(payload.artifacts.map((artifact) => artifact.id)).toContain("artifact-archived");
  });

  test("returns empty array when public API has no artifacts", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load(eventFor("/artifacts", fetchArtifacts([], [])));
    const payload = await streamedData<ArtifactsPayload>(result);
    expect(payload.artifacts).toEqual([]);
  });

  test("returns route-specific recovery payload when public API is unavailable", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const result = await mod.load(eventFor("/artifacts", (async () => Response.json({ message: "not found" }, { status: 404 })) as typeof fetch));
    const payload = await streamedData<ArtifactsPayload>(result);

    expect(payload.artifacts).toEqual([]);
    expect(payload.error).toEqual({
      message: "Artifacts could not load.",
      recovery: "Retry after the local API is reachable.",
      traceId: "artifacts-list",
    });
  });

  test("bulk action archives selected artifacts through public API", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);
    const result = await mod.actions.bulk(actionEventFor(formFor("archive", ["artifact-report"]), fetchArtifactMutations(calls)));

    expect(result).toEqual({ ok: true, action: "archive", count: 1 });
    expect(calls).toEqual(["POST /api/v1/artifacts/artifact-report/archive sid=test-session"]);
  });

  test("bulk action deletes selected artifacts through public API", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 7}`);
    const result = await mod.actions.bulk(actionEventFor(formFor("delete", ["artifact-report"]), fetchArtifactMutations(calls)));

    expect(result).toEqual({ ok: true, action: "delete", count: 1 });
    expect(calls).toEqual(["DELETE /api/v1/artifacts/artifact-report sid=test-session"]);
  });

  test("upload action creates artifact metadata through public API", async () => {
    const calls: string[] = [];
    const form = new FormData();
    form.set("filename", "uat-evidence.txt");
    form.set("projectId", "project-1");
    form.set("traceId", "trace-upload");
    form.set("mime", "text/plain");
    form.set("sizeBytes", "42");
    form.set("runId", "run-1");
    form.set("taskId", "task-1");
    form.set("bodyPath", "artifacts/uat-evidence.txt");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 8}`);
    const result = await mod.actions.upload(actionEventFor(form, fetchArtifactMutations(calls)));

    expect(result).toMatchObject({ ok: true, mode: "upload", artifact: { id: "artifact-uploaded" } });
    expect(calls).toEqual(["POST /api/v1/artifacts sid=test-session"]);
  });
});
