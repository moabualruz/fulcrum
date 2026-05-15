import { describe, expect, test } from "bun:test";

interface RedirectError {
  status: number;
  location: string;
}

function isRedirect(error: unknown): error is RedirectError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      "location" in error,
  );
}

function routeEvent(fetch: typeof globalThis.fetch, url = "http://localhost/docs/doc-1/history") {
  return {
    params: { id: "doc-1" },
    locals: {
      activeProjectId: null,
      session: { userId: "user-1" },
      orgId: "org-1",
      userId: "user-1",
      em: null,
      container: null,
    },
    fetch,
    request: new Request(url, { headers: { cookie: "sid=session-1" } }),
    url: new URL(url),
  };
}

describe("/docs/[id]/history public API route", () => {
  test("loads document versions and diff through the public document API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "http://localhost/api/v1/docs/doc-1") {
        return json({ id: "doc-1", title: "Design Doc" });
      }
      if (url === "http://localhost/api/v1/docs/doc-1/versions") {
        return json([
          {
            id: "version-2",
            version: 2,
            title: "Design Doc v2",
            bodyMd: "after",
            createdAt: "2026-05-15T10:00:00.000Z",
          },
          {
            id: "version-1",
            version: 1,
            title: "Design Doc v1",
            bodyMd: "before",
            createdAt: "2026-05-15T09:00:00.000Z",
          },
        ]);
      }
      if (url === "http://localhost/api/v1/docs/doc-1/versions/diff?fromVersion=1&toVersion=2") {
        return json({ bodyMdBefore: "before", bodyMdAfter: "after" });
      }
      return json({ message: "not found" }, 404);
    }) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?doc-history-load=${Date.now()}`);

    const result = await mod.load(routeEvent(fetch, "http://localhost/docs/doc-1/history?from=1&to=2") as never);

    expect(result.doc).toEqual({ id: "doc-1", title: "Design Doc" });
    expect(result.versions).toEqual([
      expect.objectContaining({
        id: "version-2",
        version: 2,
        versionNum: 2,
        body: "after",
        created_at: "2026-05-15T10:00:00.000Z",
        isSnapshot: true,
      }),
      expect.objectContaining({
        id: "version-1",
        version: 1,
        versionNum: 1,
        body: "before",
        created_at: "2026-05-15T09:00:00.000Z",
        isSnapshot: true,
      }),
    ]);
    expect(result.diffHtml).toBe("<del>before</del><ins>after</ins>");
    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost/api/v1/docs/doc-1",
      "http://localhost/api/v1/docs/doc-1/versions",
      "http://localhost/api/v1/docs/doc-1/versions/diff?fromVersion=1&toVersion=2",
    ]);
    for (const call of calls) {
      expect(call.init).toMatchObject({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({ cookie: "sid=session-1" }),
      });
    }
  });

  test("restore posts to the public document restore endpoint and redirects to the document", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return json({ id: "doc-1", title: "Restored" });
    }) as typeof globalThis.fetch;
    const form = new FormData();
    form.set("version", "2");
    const event = {
      ...routeEvent(fetch),
      request: new Request("http://localhost/docs/doc-1/history", {
        method: "POST",
        body: form,
        headers: { cookie: "sid=session-1" },
      }),
    };
    const mod = await import(`./+page.server.ts?doc-history-restore=${Date.now()}`);

    let thrown: unknown;
    try {
      await mod.actions.restore(event as never);
    } catch (error) {
      thrown = error;
    }

    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as RedirectError).status).toBe(303);
    expect((thrown as RedirectError).location).toBe("/docs/doc-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost/api/v1/docs/doc-1/versions/2/restore");
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ cookie: "sid=session-1" }),
    });
  });

  test("route source does not use direct application scope or document query modules", async () => {
    const source = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();

    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("application/docs/queries");
    expect(source).not.toContain("version-queries");
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
