import { describe, expect, test } from "bun:test";

function loadEvent(fetch: typeof globalThis.fetch, params: Record<string, string> = {}, locals: Partial<App.Locals> = {}) {
  const url = new URL("http://localhost/audit");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return {
    url,
    fetch,
    locals: {
      activeProjectId: null,
      session: { userId: "user-1" },
      orgId: "org-1",
      em: null,
      container: null,
      ...locals,
    },
    request: new Request(url, {
      headers: { cookie: "sid=session-1" },
    }),
  };
}

describe("/audit +page.server.ts load()", () => {
  test("loads audit rows through the public audit API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return Response.json({
        data: [{
          id: "audit-1",
          orgId: "org-1",
          projectId: "project-1",
          userId: "user-1",
          subjectKind: "task",
          subjectId: "task-1",
          verb: "created",
          payload: { traceId: "trace-1" },
          createdAt: "2026-05-15T10:00:00.000Z",
        }],
        total: 26,
      });
    }) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?audit-public-api=${Date.now()}`);

    const result = await mod.load(loadEvent(fetch, {
      actor: "user-1",
      kind: "task",
      verb: "created",
      project: "project-1",
      date_from: "2026-05-01",
      date_to: "2026-05-31",
      page: "2",
    }) as never);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "http://localhost/api/v1/audit?orgId=org-1&projectId=project-1&userId=user-1&kind=task&verb=created&since=2026-05-01&until=2026-05-31&limit=25&offset=25",
    );
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: expect.objectContaining({ cookie: "sid=session-1" }),
    });
    expect(result).toMatchObject({
      total: 26,
      page: 2,
      actor: "user-1",
      kind: "task",
      verb: "created",
      project: "project-1",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      events: [{
        id: "audit-1",
        org_id: "org-1",
        project_id: "project-1",
        actor: "user-1",
        subject_kind: "task",
        subject_id: "task-1",
        verb: "created",
        payload: { traceId: "trace-1" },
        created_at: "2026-05-15T10:00:00.000Z",
      }],
    });
  });

  test("maps public API failures to a route 502", async () => {
    const fetch = (async () =>
      Response.json({ message: "Audit public API application facade is not configured." }, { status: 500 })) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?audit-public-api-failure=${Date.now()}`);

    let thrown: unknown;
    try {
      await mod.load(loadEvent(fetch) as never);
    } catch (cause) {
      thrown = cause;
    }

    expect((thrown as { status?: number })?.status).toBe(502);
  });

  test("page exposes actor, subject kind, verb, date range, and project filters", async () => {
    const source = await Bun.file(new URL("./+page.svelte", import.meta.url)).text();
    for (const field of ["name=\"actor\"", "name=\"kind\"", "name=\"verb\"", "name=\"date_from\"", "name=\"date_to\"", "name=\"project\""]) {
      expect(source).toContain(field);
    }
  });

  test("route source does not use direct app scope or application queries", async () => {
    const source = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();

    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("queryAuditEventRows");
  });
});
