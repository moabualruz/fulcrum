import { describe, expect, mock, test } from "bun:test";

import { load } from "./+page.server";

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

function makeEvent(runId: string, apiFetch: typeof fetch) {
  const url = new URL(`http://localhost/runs/${runId}/artifacts`);
  return {
    params: { id: runId },
    url,
    request: new Request(url),
    fetch: apiFetch,
    locals: { activeProjectId: null },
  };
}

describe("/runs/[id]/artifacts +page.server.ts load()", () => {
  test("loads run-scoped artifacts through the public API", async () => {
    const calls: URL[] = [];
    const apiFetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      return Response.json([
        {
          id: "artifact-1",
          runId: "run-1",
          kind: "file",
          title: "output.txt",
          mime: "text/plain",
          sizeBytes: "256",
          createdAt: "2026-05-14T12:00:00.000Z",
        },
      ]);
    }) as unknown as typeof fetch;

    const result = await load(makeEvent("run-1", apiFetch) as never);
    expect(result.runId).toBe("run-1");
    const payload = await streamedData<Payload>(result);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.pathname).toBe("/api/v1/artifacts");
    expect(calls[0]?.searchParams.get("runId")).toBe("run-1");
    expect(calls[0]?.searchParams.get("archived")).toBe("false");
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
    const apiFetch = mock(async () => Response.json([])) as unknown as typeof fetch;

    const result = await load(makeEvent("run-empty", apiFetch) as never);
    const payload = await streamedData<Payload>(result);

    expect(payload.artifacts).toEqual([]);
  });
});
