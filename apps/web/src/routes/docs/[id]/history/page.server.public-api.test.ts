import { describe, expect, test } from "bun:test";

interface RedirectError {
  status: number;
  location: string;
}

function isRedirect(e: unknown): e is RedirectError {
  return Boolean(
    e && typeof e === "object" && "status" in e && "location" in e,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routeEvent(
  fetchImpl: typeof globalThis.fetch,
  url = "http://localhost/docs/doc-1/history",
  request?: Request,
) {
  return {
    params: { id: "doc-1" },
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: request ?? new Request(url, { headers: { cookie: "sid=session-1" } }),
    url: new URL(url),
  };
}

describe("/docs/[id]/history public API route", () => {
  test("load returns document title and versions from the public API", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "http://localhost/api/v1/docs/doc-1") {
        return json({ id: "doc-1", title: "Design Doc" });
      }
      if (url === "http://localhost/api/v1/docs/doc-1/versions") {
        return json([
          {
            id: "ver-2",
            versionNum: 2,
            createdAt: "2026-05-15T10:00:00.000Z",
            authorId: "user-1",
            authorName: "Alice",
            isRestoreOf: null,
          },
          {
            id: "ver-1",
            versionNum: 1,
            createdAt: "2026-05-15T09:00:00.000Z",
            authorId: "user-1",
            authorName: "Alice",
            isRestoreOf: null,
          },
        ]);
      }
      return json({ message: "not found" }, 404);
    }) as typeof globalThis.fetch;

    const mod = await import(`./+page.server.ts?history-load=${Date.now()}`);
    const result = await mod.load(routeEvent(fetchImpl) as never);

    expect(result.documentId).toBe("doc-1");
    expect(result.title).toBe("Design Doc");
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]).toMatchObject({
      id: "ver-2",
      versionNum: 2,
      authorName: "Alice",
    });
    expect(calls.map((c) => c.url)).toEqual([
      "http://localhost/api/v1/docs/doc-1",
      "http://localhost/api/v1/docs/doc-1/versions",
    ]);
  });

  test("load throws 404 when document not found", async () => {
    const fetchImpl = (async () =>
      json({ message: "Not found" }, 404)) as typeof globalThis.fetch;
    const mod = await import(`./+page.server.ts?history-404=${Date.now()}`);

    let caught: unknown;
    try {
      await mod.load(routeEvent(fetchImpl) as never);
    } catch (e) {
      caught = e;
    }
    expect((caught as { status?: number }).status).toBe(404);
  });

  test("diff action calls diffVersionById and returns HTML", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return json({ html: "<ins>new</ins><del>old</del>", hasDiff: true });
    }) as typeof globalThis.fetch;

    const fd = new FormData();
    fd.set("versionId", "ver-1");
    const request = new Request("http://localhost/docs/doc-1/history", {
      method: "POST",
      body: fd,
      headers: { cookie: "sid=session-1" },
    });
    const mod = await import(`./+page.server.ts?history-diff=${Date.now()}`);
    const result = await mod.actions.diff(routeEvent(fetchImpl, undefined, request) as never);

    expect(result).toEqual({ html: "<ins>new</ins><del>old</del>", hasDiff: true });
    expect(calls[0]?.url).toBe(
      "http://localhost/api/v1/docs/doc-1/version-ids/ver-1/diff",
    );
    expect(calls[0]?.method).toBe("GET");
  });

  test("diff action returns fail(400) when versionId is missing", async () => {
    const fetchImpl = (async () => json({})) as typeof globalThis.fetch;
    const fd = new FormData();
    const request = new Request("http://localhost/docs/doc-1/history", {
      method: "POST",
      body: fd,
    });
    const mod = await import(`./+page.server.ts?history-diff-fail=${Date.now()}`);
    const result = await mod.actions.diff(routeEvent(fetchImpl, undefined, request) as never);

    expect(result).toMatchObject({ status: 400, data: { error: "versionId is required" } });
  });

  test("restore action calls restoreVersionById and redirects back", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return json({ id: "doc-1" });
    }) as typeof globalThis.fetch;

    const fd = new FormData();
    fd.set("versionId", "ver-1");
    const request = new Request("http://localhost/docs/doc-1/history", {
      method: "POST",
      body: fd,
      headers: { cookie: "sid=session-1" },
    });
    const mod = await import(`./+page.server.ts?history-restore=${Date.now()}`);

    let caught: unknown;
    try {
      await mod.actions.restore(routeEvent(fetchImpl, undefined, request) as never);
    } catch (e) {
      caught = e;
    }

    expect(isRedirect(caught)).toBe(true);
    expect((caught as RedirectError).status).toBe(303);
    expect((caught as RedirectError).location).toBe("/docs/doc-1/history");
    expect(calls[0]?.url).toBe(
      "http://localhost/api/v1/docs/doc-1/version-ids/ver-1/restore",
    );
    expect(calls[0]?.method).toBe("POST");
  });

  test("restore action returns fail(400) when versionId is missing", async () => {
    const fetchImpl = (async () => json({})) as typeof globalThis.fetch;
    const fd = new FormData();
    const request = new Request("http://localhost/docs/doc-1/history", {
      method: "POST",
      body: fd,
    });
    const mod = await import(`./+page.server.ts?history-restore-fail=${Date.now()}`);
    const result = await mod.actions.restore(routeEvent(fetchImpl, undefined, request) as never);

    expect(result).toMatchObject({ status: 400, data: { error: "versionId is required" } });
  });

  test("route source uses only createDocumentApiForEvent, no direct imports", async () => {
    const source = await Bun.file(new URL("./+page.server.ts", import.meta.url)).text();

    expect(source).toContain("createDocumentApiForEvent");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("application/docs/queries");
    expect(source).not.toContain("application/document-service");
    expect(source).not.toContain("@knowledge-workspace");
  });
});
