import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: Record<string, unknown> }> = [];

const mockRun = {
  id: "run-1",
  org_id: "org-1",
  project_id: "project-1",
  agent: "codex",
  model: "gpt-5",
  prompt: "do thing",
  status: "succeeded",
  parent_run_id: null,
  started_at: "2026-05-14T12:00:00.000Z",
  ended_at: null,
  transcript_path: null,
  retry_count: 0,
  last_error_kind: null,
};

const mockArtifact = {
  id: "artifact-1",
  title: "summary.txt",
  kind: "text",
  body_path: "/tmp/summary.txt",
  mime: "text/plain",
  created_at: "2026-05-14T12:05:00.000Z",
  retention_until: "2026-06-01T00:00:00.000Z",
  lifecycle_state: "linked",
  preview_kind: "markdown",
  linked_doc_id: "doc-1",
  promoted_to_memory: true,
};

const mockPageDetail = {
  run: mockRun,
  transcript: null as string | null,
  diff: "diff --git a/src/app.ts b/src/app.ts\n",
  artifacts: [mockArtifact],
  events: [
    {
      id: "event-1",
      org_id: "org-1",
      project_id: "project-1",
      subject_kind: "agent_run",
      subject_id: "run-1",
      verb: "run.started",
      payload: {},
      actor: "system",
      created_at: "2026-05-14T12:00:00.000Z",
    },
  ],
};

mock.module("$lib/server/agent-run-api", () => ({
  createAgentRunApiForEvent: () => ({
    runs: {
      pageDetail: async (input: Record<string, unknown>) => {
        calls.push({ method: "pageDetail", input });
        if (input.id === "missing-run") throw new Error("not found");
        return mockPageDetail;
      },
      cancel: async (input: Record<string, unknown>) => {
        calls.push({ method: "cancel", input });
        return { ok: true };
      },
      retry: async (input: Record<string, unknown>) => {
        calls.push({ method: "retry", input });
        return { id: "run-retry" };
      },
      archiveArtifact: async (input: Record<string, unknown>) => {
        calls.push({ method: "archiveArtifact", input });
        return { ok: true };
      },
      linkArtifactToDoc: async (input: Record<string, unknown>) => {
        calls.push({ method: "linkArtifactToDoc", input });
        return { ok: true };
      },
      promoteArtifactToMemory: async (input: Record<string, unknown>) => {
        calls.push({ method: "promoteArtifactToMemory", input });
        return { ok: true };
      },
    },
  }),
}));

interface RunDetailPayload {
  run: typeof mockRun;
  transcript: string | null;
  artifacts: Array<typeof mockArtifact>;
  events: Array<{ id: string; created_at: string }>;
  observability: {
    artifacts: Array<{ id: string; lifecycleState: string }>;
    recovery: { retryable: boolean; retryCount: number; lastErrorKind: string | null };
  };
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function event(id: string, data: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  const url = new URL(`http://localhost/runs/${id}`);
  return {
    params: { id },
    locals: { activeProjectId: "project-1" },
    url,
    request: new Request(url, { method: "POST", body: fd }),
    fetch,
  };
}

describe("/runs/[id] +page.server.ts", () => {
  beforeEach(() => {
    calls.splice(0, calls.length);
    mockPageDetail.transcript = null;
    mockPageDetail.run = { ...mockRun };
  });

  test("load returns run + null transcript when transcript missing", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(event("run-1") as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBe("project-1");
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.run.id).toBe("run-1");
    expect(payload.run.status).toBe("succeeded");
    expect(payload.transcript).toBeNull();
    expect(Array.isArray(payload.events)).toBe(true);
    expect(calls).toEqual([{ method: "pageDetail", input: { id: "run-1", projectId: "project-1" } }]);
  });

  test("load returns transcript content when API provides it", async () => {
    mockPageDetail.transcript = "hello transcript";
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(event("run-1") as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.transcript).toBe("hello transcript");
    expect(payload.observability.recovery).toMatchObject({ retryable: false, retryCount: 0, lastErrorKind: null });
  });

  test("load returns artifacts produced by the run", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 11}`);
    const result = await mod.load(event("run-1") as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]).toMatchObject({
      id: "artifact-1",
      title: "summary.txt",
      retention_until: "2026-06-01T00:00:00.000Z",
      lifecycle_state: "linked",
      preview_kind: "markdown",
      linked_doc_id: "doc-1",
      promoted_to_memory: true,
    });
    expect(payload.observability.artifacts[0]).toMatchObject({ id: "artifact-1", lifecycleState: "linked" });
  });

  test("artifact actions archive, link docs, and promote memory metadata", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 12}`);
    await mod.actions.archiveArtifact(event("run-1", { artifactId: "artifact-1" }) as Parameters<typeof mod.actions.archiveArtifact>[0]);
    await mod.actions.linkArtifactToDoc(
      event("run-1", { artifactId: "artifact-1", docId: "doc-linked" }) as Parameters<typeof mod.actions.linkArtifactToDoc>[0],
    );
    await mod.actions.promoteArtifactToMemory(
      event("run-1", { artifactId: "artifact-1" }) as Parameters<typeof mod.actions.promoteArtifactToMemory>[0],
    );
    expect(calls).toEqual([
      { method: "archiveArtifact", input: { id: "run-1", artifactId: "artifact-1", projectId: "project-1" } },
      { method: "linkArtifactToDoc", input: { id: "run-1", artifactId: "artifact-1", docId: "doc-linked", projectId: "project-1" } },
      { method: "promoteArtifactToMemory", input: { id: "run-1", artifactId: "artifact-1", projectId: "project-1" } },
    ]);
  });

  test("load throws 404 when run does not exist", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      await mod.load(event("missing-run") as Parameters<typeof mod.load>[0]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 404 });
  });

  test("cancel action delegates to the run API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.cancel(event("run-1") as Parameters<typeof mod.actions.cancel>[0]);
    expect(result).toEqual({ ok: true, message: "Run cancelled" });
    expect(calls).toEqual([{ method: "cancel", input: { id: "run-1" } }]);
  });

  test("retry action redirects 303 to new run id", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    let caught: unknown;
    try {
      await mod.actions.retry(event("run-1") as Parameters<typeof mod.actions.retry>[0]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 303, location: "/runs/run-retry" });
    expect(calls).toEqual([{ method: "retry", input: { id: "run-1" } }]);
  });
});
