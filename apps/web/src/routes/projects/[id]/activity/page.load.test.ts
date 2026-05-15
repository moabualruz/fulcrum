import { describe, expect, test } from "bun:test";

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function loadEvent(fetch: typeof globalThis.fetch, url = "http://localhost/projects/project-1/activity") {
  return {
    params: { id: "project-1" },
    url: new URL(url),
    locals: {
      activeProjectId: "project-1",
      session: { userId: "user-1" },
      orgId: "org-1",
      userId: "user-1",
      em: null,
      container: null,
    },
    fetch,
    request: new Request(url, { headers: { cookie: "sid=session-1" } }),
  };
}

describe("/projects/[id]/activity +page.server.ts load", () => {
  test("loads filtered project events through the public audit API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        data: [
          {
            id: "event-1",
            orgId: "org-1",
            projectId: "project-1",
            userId: "alice",
            subjectKind: "task",
            subjectId: "task-1",
            verb: "status_changed",
            payload: { status: "done" },
            createdAt: "2026-05-15T10:00:00.000Z",
          },
        ],
        total: 1,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;
    const { load } = await import(`./+page.server.ts?project-activity=${Date.now()}`);
    const result = load(loadEvent(
      fetch,
      "http://localhost/projects/project-1/activity?kind=task&verb=status_changed&actor=alice",
    ) as never);

    expect(result).toMatchObject({
      activeProjectId: "project-1",
      projectId: "project-1",
      filter: { kind: "task", verb: "status_changed", actor: "alice" },
    });
    const payload = await streamedData<{
      events: Array<{ id: string; project_id: string | null; subject_kind: string; actor: string }>;
    }>(result);
    expect(payload.events).toEqual([
      expect.objectContaining({
        id: "event-1",
        project_id: "project-1",
        subject_kind: "task",
        actor: "alice",
      }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "http://localhost/api/v1/audit?orgId=org-1&projectId=project-1&userId=alice&kind=task&verb=status_changed&limit=20",
    );
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: expect.objectContaining({ cookie: "sid=session-1" }),
    });
  });

  test("route source does not use direct application scope or project activity queries", async () => {
    const source = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();

    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("listProjectActivityEvents");
    expect(source).not.toContain("application/projects/queries");
  });
});
