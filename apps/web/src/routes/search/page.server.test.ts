import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface SearchPayload {
  q: string;
  kinds: string[];
  dateFrom: string;
  dateTo: string;
  hits: Array<{
    id: string;
    source_kind: string;
    source_id: string;
    title: string;
    body: string;
    score: number;
    updated_at: string;
  }>;
  grouped: Record<string, SearchPayload["hits"]>;
  savedSearches: Array<{
    id: string;
    name: string;
    params: {
      q: string;
      kinds: string[];
      dateFrom: string;
      dateTo: string;
    };
  }>;
}

function eventFor(
  query: string,
  extra: Record<string, string> = {},
  fetchImpl: typeof fetch = fetchSearch(),
): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL("http://localhost/search");
  if (query.trim().length > 0) url.searchParams.set("q", query);
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return {
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function fetchSearch(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search} ${headers.get("authorization") ?? ""} ${headers.get("cookie") ?? ""}`);

    if (url.pathname === "/api/v1/search/saved" && (init?.method ?? "GET") === "GET") {
      return Response.json([
        {
          id: "saved-1",
          name: "Kernel docs",
          query_json: JSON.stringify({ q: "kernel", kinds: ["doc"], dateFrom: "2026-04-01", dateTo: "" }),
        },
      ]);
    }
    if (url.pathname === "/api/v1/search" && (init?.method ?? "GET") === "GET") {
      const kind = url.searchParams.get("kind");
      const hits = [
        hit("doc-hit", "doc", "doc-1", "Kernel notes", "Fulcrum kernel search notes", "2026-04-30T10:00:00.000Z"),
        hit("task-hit", "task", "task-1", "Kernel task", "Wire grouped search", "2026-04-29T10:00:00.000Z"),
        hit("run-hit", "run", "run-1", "Kernel run", "trace-kernel source task-1", "2026-04-29T11:00:00.000Z"),
        hit("artifact-hit", "artifact", "artifact-1", "Kernel artifact", "trace-kernel source workspace.diff", "2026-04-29T12:00:00.000Z"),
        hit("memory-hit", "memory", "memory-1", "Kernel memory", "Stored kernel concept", "2026-03-30T10:00:00.000Z"),
      ];
      const kinds = kind ? kind.split(",") : [];
      return Response.json(kinds.length > 0 ? hits.filter((row) => kinds.includes(row.source_kind)) : hits);
    }
    if (url.pathname === "/api/v1/search/saved" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return Response.json({ id: "saved-new", name: body.name, query_json: body.query_json }, { status: 201 });
    }
    return Response.json({ message: `unexpected ${url.pathname}${url.search}` }, { status: 500 });
  }) as typeof fetch;
}

function fetchSearchUnavailable(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname === "/api/v1/search/saved" && (init?.method ?? "GET") === "GET") {
      return Response.json([]);
    }
    return Response.json({ message: "not found" }, { status: 404 });
  }) as typeof fetch;
}

function hit(id: string, sourceKind: string, sourceId: string, title: string, body: string, updatedAt: string) {
  return {
    id,
    source_kind: sourceKind,
    source_id: sourceId,
    title,
    body,
    score: sourceKind === "doc" ? 1 : 0.5,
    updated_at: updatedAt,
  };
}

describe("/search +page.server.ts public API route", () => {
  test("server route uses the search public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createSearchApiForEvent");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("@knowledge-workspace/application/search");
  });

  test("empty q returns an empty search model with saved searches from public API", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("   ", {}, fetchSearch(calls))) as SearchPayload;
    expect(result).toMatchObject({ q: "", hits: [], grouped: {} });
    expect(result.savedSearches).toEqual([
      {
        id: "saved-1",
        name: "Kernel docs",
        params: { q: "kernel", kinds: ["doc"], dateFrom: "2026-04-01", dateTo: "" },
      },
    ]);
    expect(calls).toEqual([
      "GET /api/v1/search/saved?org_id=org-1&user_id=user-1 Bearer web-local sid=test-session",
    ]);
  });

  test("q matching doc and task groups hits by source_kind", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(eventFor("kernel", {}, fetchSearch(calls))) as SearchPayload;
    expect(result.grouped.doc).toHaveLength(1);
    expect(result.grouped.task).toHaveLength(1);
    expect(result.grouped.run).toHaveLength(1);
    expect(result.grouped.artifact).toHaveLength(1);
    expect(calls).toContain("GET /api/v1/search?q=kernel&org_id=org-1&limit=50 Bearer web-local sid=test-session");
  });

  test("kind facet is passed to the public API and filters to doc only", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(eventFor("kernel", { kinds: "doc" }, fetchSearch(calls))) as SearchPayload;
    expect(result.grouped.doc).toHaveLength(1);
    expect(result.grouped.task).toBeUndefined();
    expect(calls).toContain("GET /api/v1/search?q=kernel&org_id=org-1&kind=doc&limit=50 Bearer web-local sid=test-session");
  });

  test("run and artifact facets retrieve workflow context by trace/source terms", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 20}`);
    const result = await mod.load(eventFor("trace-kernel", { kinds: "run,artifact" }, fetchSearch(calls))) as SearchPayload;
    expect(result.grouped.run?.map((row) => row.source_id)).toEqual(["run-1"]);
    expect(result.grouped.artifact?.map((row) => row.source_id)).toEqual(["artifact-1"]);
    expect(result.hits.every((row) => row.body.includes("trace-kernel") || row.body.includes("source"))).toBe(true);
    expect(calls).toContain("GET /api/v1/search?q=trace-kernel&org_id=org-1&kind=run%2Cartifact&limit=50 Bearer web-local sid=test-session");
  });

  test("date facets still narrow public API hits locally", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(eventFor("kernel", { date_from: "2026-04-01" })) as SearchPayload;
    expect(result.hits.map((row) => row.id)).toEqual(["doc-hit", "task-hit", "run-hit", "artifact-hit"]);
  });

  test("search API failure returns no-result model instead of page failure", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 21}`);
    const result = await mod.load(eventFor("missing-trace", {}, fetchSearchUnavailable(calls))) as SearchPayload;
    expect(result).toMatchObject({ q: "missing-trace", hits: [], grouped: {}, savedSearches: [] });
    expect(calls).toContain("GET /api/v1/search?q=missing-trace&org_id=org-1&limit=50");
  });

  test("saveSearch posts saved-search params through the public API", async () => {
    const calls: string[] = [];
    const form = new FormData();
    form.set("name", "Saved kernel");
    form.set("q", "kernel");
    form.set("kinds", "doc,task");
    form.set("date_from", "2026-04-01");
    form.set("date_to", "2026-04-30");
    const url = new URL("http://localhost/search?/saveSearch");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.actions.saveSearch({
      url,
      locals: { orgId: "org-1", userId: "user-1" },
      fetch: fetchSearch(calls),
      request: new Request(url, {
        method: "POST",
        body: form,
        headers: { cookie: "sid=test-session" },
      }),
    } as Parameters<typeof mod.actions.saveSearch>[0]);

    expect(result).toEqual({ saved: true });
    expect(calls).toEqual([
      "POST /api/v1/search/saved Bearer web-local sid=test-session",
    ]);
  });
});
