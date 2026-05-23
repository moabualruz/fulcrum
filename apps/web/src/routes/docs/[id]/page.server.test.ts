import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

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
  comments: Array<{ id: string; bodyMd: string; authorId: string; resolved: boolean; parentCommentId: string | null }>;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; href: string }>;
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

function makeEvent(fetchImpl: typeof fetch, params = { id: "doc-1" }, request?: Request) {
  return {
    params,
    locals: { activeProjectId: "project-1", orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: request ?? new Request("http://localhost/docs/doc-1", {
      headers: { cookie: "sid=test-session" },
    }),
    url: new URL("http://localhost/docs/doc-1"),
  };
}

// The route resolves its public-API base URL from FULCRUM_SERVER_URL and only
// takes the HTTP/public-API path when that env var is set. Pin it to the host
// the mock fetch responds on so the route exercises the public document API.
const PREVIOUS_SERVER_URL = process.env["FULCRUM_SERVER_URL"];
beforeAll(() => {
  process.env["FULCRUM_SERVER_URL"] = "http://localhost";
});
afterAll(() => {
  if (PREVIOUS_SERVER_URL === undefined) delete process.env["FULCRUM_SERVER_URL"];
  else process.env["FULCRUM_SERVER_URL"] = PREVIOUS_SERVER_URL;
});

describe("/docs/[id] +page.server.ts public API route", () => {
  test("server route reaches the document public API for reads and mutations", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    // The route delegates document reads and every mutation through the
    // public document API caller rather than building HTTP requests inline.
    expect(source).toContain("createDocumentApiForEvent");
    expect(source).toContain("api.docs.get");
    expect(source).toContain(".docs.delete(");
    expect(source).toContain(".docs.createComment(");
    expect(source).toContain(".docs.resolveComment(");
    // No inline route-local HTTP request construction against the docs API.
    expect(source).not.toMatch(/fetch\(\s*["'`]\/api\/v1\/docs/);
  });

  test("load returns document detail, backlinks, comments, and attachments from the public API", async () => {
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
      if (url === "http://localhost/api/v1/docs/doc-1/comments") {
        return Response.json([
          {
            id: "comment-1",
            bodyMd: "Needs a source link.",
            authorId: "user-2",
            status: "open",
            parentCommentId: null,
            createdAt: "2026-05-15T08:30:00.000Z",
            updatedAt: "2026-05-15T08:30:00.000Z",
          },
          {
            id: "comment-2",
            bodyMd: "Resolved.",
            authorId: "user-1",
            status: "resolved",
            parentCommentId: "comment-1",
            createdAt: "2026-05-15T08:40:00.000Z",
            updatedAt: "2026-05-15T08:45:00.000Z",
          },
        ]);
      }
      if (url === "http://localhost/api/v1/docs/doc-1/attachments") {
        return Response.json([
          {
            id: "attachment-1",
            fileName: "brief.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            storagePath: "doc-attachments/brief.pdf",
          },
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
    expect(payload.comments).toEqual([
      {
        id: "comment-1",
        bodyMd: "Needs a source link.",
        authorId: "user-2",
        resolved: false,
        parentCommentId: null,
      },
      {
        id: "comment-2",
        bodyMd: "Resolved.",
        authorId: "user-1",
        resolved: true,
        parentCommentId: "comment-1",
      },
    ]);
    expect(payload.attachments).toEqual([
      {
        id: "attachment-1",
        fileName: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        href: "/doc-attachments/brief.pdf",
      },
    ]);
    expect(calls).toEqual([
      { url: "http://localhost/api/v1/docs/doc-1", method: "GET", cookie: "sid=test-session" },
      { url: "http://localhost/api/v1/docs/doc-1/backlinks", method: "GET", cookie: "sid=test-session" },
      { url: "http://localhost/api/v1/docs/doc-1/comments", method: "GET", cookie: "sid=test-session" },
      { url: "http://localhost/api/v1/docs/doc-1/attachments", method: "GET", cookie: "sid=test-session" },
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

  test("createComment action posts through the public comments API and redirects back to the doc", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({ id: "comment-1" }, { status: 201 });
    }) as typeof fetch;
    const form = new FormData();
    form.set("bodyMd", "Please add acceptance criteria.");
    form.set("parentCommentId", "comment-parent");
    const request = new Request("http://localhost/docs/doc-1", { method: "POST", body: form });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);

    let caught: unknown;
    try {
      await mod.actions.createComment(makeEvent(fetchImpl, { id: "doc-1" }, request) as Parameters<
        typeof mod.actions.createComment
      >[0]);
    } catch (error) {
      caught = error;
    }

    expect(calls).toEqual([{
      url: "http://localhost/api/v1/docs/doc-1/comments",
      method: "POST",
      body: {
        authorId: "user-1",
        bodyMd: "Please add acceptance criteria.",
        parentCommentId: "comment-parent",
      },
    }]);
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) expect(caught.location).toBe("/docs/doc-1");
  });

  test("resolveComment action resolves through the public comments API and redirects back to the doc", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({ id: "comment-1", status: "resolved" });
    }) as typeof fetch;
    const form = new FormData();
    form.set("commentId", "comment-1");
    const request = new Request("http://localhost/docs/doc-1", { method: "POST", body: form });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);

    let caught: unknown;
    try {
      await mod.actions.resolveComment(makeEvent(fetchImpl, { id: "doc-1" }, request) as Parameters<
        typeof mod.actions.resolveComment
      >[0]);
    } catch (error) {
      caught = error;
    }

    expect(calls).toEqual([{
      url: "http://localhost/api/v1/docs/comments/comment-1/resolve",
      method: "PATCH",
      body: { resolved: true },
    }]);
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) expect(caught.location).toBe("/docs/doc-1");
  });
});
