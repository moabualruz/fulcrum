import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface DocsPayload {
  documents: Array<{
    id: string;
    title: string;
    kind: string;
    project_id: string | null;
    updated_at: string;
    body_excerpt: string;
  }>;
  projectTree: unknown[];
  globalTree: unknown[];
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function fakeEvent(searchParams: Record<string, string>, fetchImpl: typeof fetch, activeProjectId: string | null = "project-1"): Parameters<
  typeof import("./+page.server.ts").load
>[0] {
  const url = new URL("http://localhost/docs");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return {
    url,
    locals: { activeProjectId, orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function documentRows() {
  return [
    {
      id: "decision-doc",
      title: "Kernel decision",
      docType: "note",
      projectId: "project-1",
      frontmatter: { kind: "decision" },
      bodyMd: "the kernel decided everything",
      updatedAt: "2026-04-03T00:00:00.000Z",
    },
    {
      id: "spec-doc",
      title: "Spec doc",
      docType: "note",
      projectId: "project-1",
      frontmatter: { kind: "spec" },
      bodyMd: "details about the kernel spec",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
    {
      id: "global-note",
      title: "Global note",
      docType: "note",
      projectId: null,
      frontmatter: { kind: "note" },
      bodyMd: "totally unrelated body",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
  ];
}

function fetchDocs(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url} ${new Headers(init?.headers).get("cookie") ?? ""}`);
    if (url === "http://localhost/api/v1/docs?orgId=org-1") {
      return Response.json(documentRows());
    }
    if (url === "http://localhost/api/v1/projects?orgId=org-1") {
      return Response.json({ data: [{ id: "project-1", slug: "project-1", name: "Project One" }] });
    }
    return Response.json({ message: `unexpected ${url}` }, { status: 500 });
  }) as typeof fetch;
}

describe("/docs +page.server.ts public API route", () => {
  test("server route uses the document public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createDocumentApiForEvent");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("listDocs(");
  });

  test("default load returns public API docs in received order with empty kind and q", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(fakeEvent({}, fetchDocs(calls)));
    expect(result.kind).toBe("");
    expect(result.q).toBe("");
    expect(result.activeProjectId).toBe("project-1");

    const payload = await streamedData<DocsPayload>(result);
    expect(payload.documents.map((doc) => doc.id)).toEqual(["decision-doc", "spec-doc", "global-note"]);
    expect(payload.documents[0]).toMatchObject({
      kind: "decision",
      project_id: "project-1",
      updated_at: "2026-04-03T00:00:00.000Z",
      body_excerpt: "the kernel decided everything",
    });
    expect(payload.projectTree).toHaveLength(2);
    expect(payload.globalTree).toHaveLength(1);
    // Loader also fetches /projects to resolve slug → UUID for the tree
    // filter; tolerate the order of parallel fetches.
    expect(calls.sort()).toEqual([
      "GET http://localhost/api/v1/docs?orgId=org-1 sid=test-session",
      "GET http://localhost/api/v1/projects?orgId=org-1 sid=test-session",
    ]);
  });

  test("kind filter narrows rows locally without changing the public API request", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(fakeEvent({ kind: "spec" }, fetchDocs(calls)));
    expect(result.kind).toBe("spec");
    const payload = await streamedData<DocsPayload>(result);
    expect(payload.documents.map((doc) => doc.id)).toEqual(["spec-doc"]);
    // Loader also fetches /projects to resolve slug → UUID for the tree
    // filter; tolerate the order of parallel fetches.
    expect(calls.sort()).toEqual([
      "GET http://localhost/api/v1/docs?orgId=org-1 sid=test-session",
      "GET http://localhost/api/v1/projects?orgId=org-1 sid=test-session",
    ]);
  });

  test("free-text q filters title and body excerpts locally", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(fakeEvent({ q: "kernel" }, fetchDocs()));
    expect(result.q).toBe("kernel");
    const payload = await streamedData<DocsPayload>(result);
    expect(payload.documents.map((doc) => doc.id)).toEqual(["decision-doc", "spec-doc"]);
  });

  test("returns empty arrays when public API has no documents", async () => {
    const fetchImpl = (async () => Response.json([])) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(fakeEvent({}, fetchImpl));
    const payload = await streamedData<DocsPayload>(result);
    expect(payload.documents).toEqual([]);
    expect(payload.projectTree).toEqual([]);
    expect(payload.globalTree).toEqual([]);
  });
});
