import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface DocPayload {
  doc: {
    id: string;
    org_id: string;
    project_id: string | null;
    kind: string;
    title: string;
    body: string;
    renderedHtml: string;
    frontmatter: Record<string, unknown>;
    updated_at: string;
  };
  backlinks: Array<{ id: string; title?: string; href: string }>;
}

interface RedirectError {
  status: number;
  location: string;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function isRedirect(e: unknown): e is RedirectError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    "location" in e &&
    typeof (e as RedirectError).status === "number"
  );
}

function makeEvent(fetchImpl: typeof fetch, params = { id: "doc-1" }) {
  return {
    params,
    locals: { activeProjectId: "project-1", orgId: "org-1" },
    fetch: fetchImpl,
    request: new Request("http://localhost/docs/doc-1", {
      headers: { cookie: "sid=test-session" },
    }),
    url: new URL("http://localhost/docs/doc-1"),
  };
}

describe("/docs/[id] +page.server.ts public API route", () => {
  test("server route uses the document public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createDocumentApiForEvent");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("getDoc(");
    expect(source).not.toContain("listDocBacklinks");
    expect(source).not.toContain("deleteDocumentAction");
  });

  test("load returns document detail and backlinks from the public API", async () => {
    const calls: Array<{ url: string; method: string; cookie: string | null }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        cookie: new Headers(init?.headers).get("cookie"),
      });
      if (url === "http://localhost/api/v1/docs/doc-1") {
        return Response.json({
          id: "doc-1",
          orgId: "org-1",
          projectId: "project-1",
          docType: "spec",
          title: "Doc Title",
          bodyMd: "# Heading\nbody content\n",
          frontmatter: { title: "Doc Title", labels: ["one", "two"] },
          updatedAt: "2026-05-15T08:00:00.000Z",
        });
      }
      if (url === "http://localhost/api/v1/docs/doc-1/backlinks") {
        return Response.json([
          { fromDocId: "source-doc", title: "Source Doc" },
        ]);
      }
      return Response.json({ message: `unexpected ${url}` }, { status: 500 });
    }) as typeof fetch;

    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = mod.load(makeEvent(fetchImpl) as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBe("project-1");
    const payload = await streamedData<DocPayload>(result);

    expect(payload.doc).toMatchObject({
      id: "doc-1",
      org_id: "org-1",
      project_id: "project-1",
      kind: "spec",
      title: "Doc Title",
      body: "# Heading\nbody content\n",
      updated_at: "2026-05-15T08:00:00.000Z",
    });
    expect(payload.doc.renderedHtml).toContain("<h1");
    expect(payload.backlinks).toEqual([
      { id: "source-doc", title: "Source Doc", href: "/docs/source-doc" },
    ]);
    expect(calls).toEqual([
      { url: "http://localhost/api/v1/docs/doc-1", method: "GET", cookie: "sid=test-session" },
      { url: "http://localhost/api/v1/docs/doc-1/backlinks", method: "GET", cookie: "sid=test-session" },
    ]);
  });

  test("load maps public API missing documents to route 404", async () => {
    const fetchImpl = (async () => Response.json({ message: "Not found" }, { status: 404 })) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    let caught: unknown;
    try {
      const result = mod.load(makeEvent(fetchImpl, { id: "missing-doc" }) as Parameters<typeof mod.load>[0]);
      await streamedData<DocPayload>(result);
    } catch (error) {
      caught = error;
    }
    expect((caught as { status?: number }).status).toBe(404);
  });

  test("delete action calls the public API and redirects to docs", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);

    let caught: unknown;
    try {
      await mod.actions.delete(makeEvent(fetchImpl) as Parameters<typeof mod.actions.delete>[0]);
    } catch (error) {
      caught = error;
    }

    expect(calls).toEqual([{ url: "http://localhost/api/v1/docs/doc-1", method: "DELETE" }]);
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) {
      expect(caught.status).toBe(303);
      expect(caught.location).toBe("/docs");
    }
  });
});
