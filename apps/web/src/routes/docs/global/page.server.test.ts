import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function makeEvent(fetchImpl: typeof fetch) {
  return {
    locals: { activeProjectId: "project-1", orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request("http://localhost/docs/global", {
      headers: { cookie: "sid=test-session" },
    }),
    url: new URL("http://localhost/docs/global"),
  };
}

describe("/docs/global +page.server.ts", () => {
  test("server route uses the document public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createDocumentApiForEvent");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("listDocs(");
  });

  test("load returns only global documents as a nested tree from the public API", async () => {
    const calls: Array<{ url: string; method: string; cookie: string | null }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        cookie: new Headers(init?.headers).get("cookie"),
      });
      return Response.json([
        {
          id: "project-doc",
          title: "Project Doc",
          type: "spec",
          projectId: "project-1",
          updatedAt: "2026-05-15T08:00:00.000Z",
        },
        {
          id: "global-child",
          title: "Child",
          type: "note",
          projectId: null,
          parentId: "global-root",
          sortOrder: 1,
          updatedAt: "2026-05-15T08:05:00.000Z",
        },
        {
          id: "global-root",
          title: "Root",
          type: "wiki",
          projectId: null,
          parentId: null,
          sortOrder: 0,
          updatedAt: "2026-05-15T08:01:00.000Z",
        },
      ]);
    }) as typeof fetch;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);

    const result = await mod.load(makeEvent(fetchImpl) as Parameters<typeof mod.load>[0]);

    expect(result.tree).toEqual([
      expect.objectContaining({
        id: "global-root",
        title: "Root",
        kind: "wiki",
        parent_id: null,
        sort_order: 0,
        children: [
          expect.objectContaining({
            id: "global-child",
            title: "Child",
            kind: "note",
            parent_id: "global-root",
            sort_order: 1,
          }),
        ],
      }),
    ]);
    expect(calls).toEqual([
      { url: "http://localhost/api/v1/docs?orgId=org-1", method: "GET", cookie: "sid=test-session" },
    ]);
  });
});
