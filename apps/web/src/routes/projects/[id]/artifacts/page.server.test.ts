import { describe, expect, mock, test } from "bun:test";

import { load } from "./+page.server";

interface Payload {
  artifacts: Array<{
    id: string;
    project_id: string | null;
    title: string;
    size: number | null;
  }>;
  stats: {
    count: number;
    totalBytes: number;
  };
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function makeEvent(projectId: string, apiFetch: typeof fetch) {
  const url = new URL(`http://localhost/projects/${projectId}/artifacts`);
  return {
    params: { id: projectId },
    url,
    request: new Request(url),
    fetch: apiFetch,
    locals: { activeProjectId: null },
  };
}

describe("/projects/[id]/artifacts +page.server.ts load()", () => {
  test("loads project artifacts and stats through the public API", async () => {
    const calls: URL[] = [];
    const apiFetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.searchParams.get("archived") === "false") {
        return Response.json([
          {
            id: "artifact-1",
            projectId: "project-1",
            kind: "file",
            title: "report.md",
            mime: "text/markdown",
            sizeBytes: "1024",
            createdAt: "2026-05-14T12:00:00.000Z",
          },
        ]);
      }
      return Response.json([
        {
          id: "artifact-1",
          projectId: "project-1",
          kind: "file",
          title: "report.md",
          sizeBytes: "1024",
        },
        {
          id: "artifact-archived",
          projectId: "project-1",
          kind: "report",
          title: "old.json",
          sizeBytes: "2048",
          archived: true,
        },
      ]);
    }) as unknown as typeof fetch;

    const result = await load(makeEvent("project-1", apiFetch) as never);
    expect(result.projectId).toBe("project-1");
    const payload = await streamedData<Payload>(result);

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.searchParams.get("projectId"))).toEqual(["project-1", "project-1"]);
    expect(calls.map((call) => call.searchParams.get("archived"))).toContain("false");
    expect(calls.map((call) => call.searchParams.get("archived"))).toContain(null);
    expect(payload.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        project_id: "project-1",
        title: "report.md",
        size: 1024,
      }),
    ]);
    expect(payload.stats).toEqual({ count: 2, totalBytes: 3072 });
  });

  test("returns zero stats when the public API returns no artifacts", async () => {
    const apiFetch = mock(async () => Response.json([])) as unknown as typeof fetch;

    const result = await load(makeEvent("project-empty", apiFetch) as never);
    const payload = await streamedData<Payload>(result);

    expect(payload.artifacts).toEqual([]);
    expect(payload.stats).toEqual({ count: 0, totalBytes: 0 });
  });
});
