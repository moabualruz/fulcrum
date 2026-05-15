import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface ArtifactRow {
  id: string;
  project_id: string | null;
  run_id: string | null;
  kind: string;
  title: string;
  mime: string | null;
  archived: boolean;
  size: number | null;
  created_at: string;
}

interface ArtifactsPayload {
  artifacts: ArtifactRow[];
}

interface PublicArtifactRow {
  id: string;
  projectId: string | null;
  runId: string | null;
  taskId: string | null;
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
    const archived = url.searchParams.get("archived");
    const rows = seed.filter((artifact) => {
      if (mime && artifact.mime !== mime) return false;
      if (kind && artifact.kind !== kind) return false;
      if (projectId && artifact.projectId !== projectId) return false;
      if (archived === "false" && artifact.archived) return false;
      return true;
    });
    return Response.json(rows);
  }) as typeof fetch;
}

function defaultArtifacts(): PublicArtifactRow[] {
  return [
    {
      id: "artifact-report",
      projectId: "project-1",
      runId: "run-1",
      taskId: null,
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
      runId: null,
      taskId: null,
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
      runId: null,
      taskId: null,
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

  test("kind and project filters are passed to public API", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(eventFor("/artifacts?kind=report&project=project-1", fetchArtifacts(calls)));
    const payload = await streamedData<ArtifactsPayload>(result);

    expect(payload.artifacts.map((artifact) => artifact.id)).toEqual(["artifact-data"]);
    expect(calls).toEqual(["GET /api/v1/artifacts?projectId=project-1&kind=report&archived=false sid=test-session"]);
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
});
