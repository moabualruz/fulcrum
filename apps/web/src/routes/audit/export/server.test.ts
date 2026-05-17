import { describe, expect, test } from "bun:test";

function exportEvent(fetch: typeof globalThis.fetch, search = "") {
  const url = new URL(`http://localhost/audit/export${search}`);
  return {
    url,
    fetch,
    locals: {
      activeProjectId: null,
      session: { userId: "user-1" },
      orgId: "org-1",
      em: null,
      container: null,
    },
    request: new Request(url, {
      headers: { cookie: "sid=session-1" },
    }),
  };
}

describe("/audit/export +server.ts", () => {
  test("exports through the public audit API with filters and cookies", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response("id,verb\naudit-1,created\n", {
        headers: { "content-type": "text/csv" },
      });
    }) as typeof globalThis.fetch;
    const mod = await import(`./+server.ts?audit-export-public-api=${Date.now()}`);

    const response = await mod.GET(exportEvent(
      fetch,
      "?format=csv&actor=user-1&kind=task&verb=created&project=project-1&since=2026-05-01&until=2026-05-31",
    ) as never);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "http://localhost/api/v1/audit/export?orgId=org-1&projectId=project-1&userId=user-1&kind=task&verb=created&since=2026-05-01&until=2026-05-31&limit=100000&offset=0&format=csv",
    );
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: expect.objectContaining({ cookie: "sid=session-1" }),
    });
    await expect(response.text()).resolves.toContain("audit-1,created");
    expect(response.headers.get("content-type")).toBe("text/csv");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="audit-\d{4}-\d{2}-\d{2}\.csv"$/);
  });

  test("returns an accepted job response when the public API defers export", async () => {
    const fetch = (async () => Response.json({ jobId: "job-1" })) as typeof globalThis.fetch;
    const mod = await import(`./+server.ts?audit-export-job=${Date.now()}`);

    const response = await mod.GET(exportEvent(fetch, "?format=json") as never);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ jobId: "job-1" });
  });

  test("source does not use direct app scope or application export helpers", async () => {
    const source = await Bun.file(new URL("./+server.ts", import.meta.url)).text();

    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("queryAuditEventRows");
    expect(source).not.toContain("eventsToCsv");
    expect(source).not.toContain("eventsToJson");
  });
});
