import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: Record<string, unknown> }> = [];

mock.module("$lib/server/agent-run-api", () => ({
  createAgentRunApiForEvent: () => ({
    runs: {
      pageDetail: async (input: Record<string, unknown>) => {
        calls.push({ method: "pageDetail", input });
        if (input.id === "missing-run") throw new Error("not found");
        return { run: { id: input.id }, transcript: null, diff: null, artifacts: [], events: [] };
      },
    },
  }),
}));

mock.module("$lib/server/artifact-api", () => ({
  createArtifactApiForEvent: () => ({
    artifacts: {
      list: async (input: Record<string, unknown>) => {
        calls.push({ method: "artifacts.list", input });
        return input.runId === "empty-run"
          ? []
          : [
              {
                id: "artifact-1",
                runId: input.runId,
                kind: "file",
                title: "output.txt",
                mime: "text/plain",
                sizeBytes: "256",
                createdAt: "2026-05-14T12:00:00.000Z",
              },
            ];
      },
    },
  }),
  toArtifactRow: (artifact: {
    id: string;
    runId: string | null;
    title: string;
    sizeBytes: string | number | null;
    createdAt: string;
  }) => ({
    id: artifact.id,
    run_id: artifact.runId,
    title: artifact.title,
    size: artifact.sizeBytes == null ? null : Number(artifact.sizeBytes),
    created_at: artifact.createdAt,
  }),
}));

interface Payload {
  artifacts: Array<{
    id: string;
    run_id: string | null;
    title: string;
    size: number | null;
    created_at: string;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function makeEvent(runId: string) {
  const url = new URL(`http://localhost/runs/${runId}/artifacts`);
  return {
    params: { id: runId },
    url,
    request: new Request(url),
    fetch,
    locals: { activeProjectId: "project-1" },
  };
}

describe("/runs/[id]/artifacts +page.server.ts load()", () => {
  beforeEach(() => {
    calls.splice(0, calls.length);
  });

  test("loads run-scoped artifacts through the public API", async () => {
    const { load } = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await load(makeEvent("run-1") as never);
    expect(result.runId).toBe("run-1");
    const payload = await streamedData<Payload>(result);

    expect(calls).toEqual([
      { method: "pageDetail", input: { id: "run-1", projectId: "project-1" } },
      { method: "artifacts.list", input: { runId: "run-1", archived: false } },
    ]);
    expect(payload.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        run_id: "run-1",
        title: "output.txt",
        size: 256,
        created_at: "2026-05-14T12:00:00.000Z",
      }),
    ]);
  });

  test("returns empty when the public API has no artifacts for the run", async () => {
    const { load } = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await load(makeEvent("empty-run") as never);
    const payload = await streamedData<Payload>(result);
    expect(payload.artifacts).toEqual([]);
    expect(calls).toEqual([
      { method: "pageDetail", input: { id: "empty-run", projectId: "project-1" } },
      { method: "artifacts.list", input: { runId: "empty-run", archived: false } },
    ]);
  });

  test("throws 404 when the run does not exist", async () => {
    const { load } = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      await load(makeEvent("missing-run") as never);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 404 });
    expect(calls).toEqual([{ method: "pageDetail", input: { id: "missing-run", projectId: "project-1" } }]);
  });
});
