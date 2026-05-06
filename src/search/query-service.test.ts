/**
 * Tests for SearchQueryService — PGlite FTS query with facets.
 * These tests run against a mock TestStore.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { SearchQueryService } from "./query-service.ts";
import type { TestStore } from "../test-support/product-fixtures.ts";

function makeDb(rows: Record<string, unknown>[] = []): TestStore {
  return {
    query: mock(() => Promise.resolve(rows)),
  } as unknown as TestStore;
}

function queryCalls(db: TestStore): unknown[][] {
  return (db.query as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

describe("SearchQueryService", () => {
  let svc: SearchQueryService;

  describe("query() — empty term", () => {
    test("returns empty results without hitting DB when term is blank", async () => {
      const db = makeDb([{ id: "1" }]);
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "   " });
      expect(result).toEqual({ results: [], total: 0 });
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe("query() — with term", () => {
    const fakeRows = [
      {
        id: "row1",
        entity_kind: "doc",
        entity_id: "d1",
        title: "Test document",
        body: "body text",
        labels: ["alpha"],
        metadata: { doc_type: "spec" },
        project_id: "p1",
        status: null,
        rank: 0.8,
        snippet: "…Test document…",
      },
    ];

    beforeEach(() => {
      const db = makeDb(fakeRows);
      svc = new SearchQueryService(db);
    });

    test("Test 1: returns results with rank field from ts_rank", async () => {
      const db = makeDb(fakeRows);
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "test" });
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toHaveProperty("rank");
      expect(result.results[0]!.rank).toBeGreaterThanOrEqual(0);
    });

    test("Test 2: filters by entityKind when kinds filter is provided", async () => {
      const db = makeDb(fakeRows);
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "test", filters: { kinds: ["doc"] } });
      expect(result.results).toHaveLength(1);
      // ensure SQL was called with kinds filter (check db.query was called)
      expect(db.query).toHaveBeenCalled();
      const sql = queryCalls(db)[0]?.[0] as string;
      expect(sql).toMatch(/entity_kind/i);
    });

    test("Test 3: returns facetCounts when facets=true", async () => {
      // First call returns main results, subsequent calls return facet aggregates
      const query = mock()
        .mockResolvedValueOnce(fakeRows)
        .mockResolvedValueOnce([{ value: "doc", count: "1" }])
        .mockResolvedValueOnce([{ value: "p1", count: "1" }])
        .mockResolvedValueOnce([]);
      const db = {
        query,
      } as unknown as TestStore;
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "test", facets: true });
      expect(result.facets).toBeDefined();
      expect(result.facets).toHaveProperty("kind");
      expect(result.facets).toHaveProperty("project");
      expect(result.facets).toHaveProperty("status");
    });

    test("Test 4: empty term returns empty results without DB scan", async () => {
      const db = makeDb();
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "" });
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    test("Test 5: respects limit and offset for pagination", async () => {
      const db = makeDb(fakeRows);
      svc = new SearchQueryService(db);
      await svc.query("org1", { term: "test", limit: 10, offset: 5 });
      const sql = queryCalls(db)[0]?.[0] as string;
      const params = queryCalls(db)[0]?.[1] as unknown[];
      expect(sql).toMatch(/LIMIT/i);
      expect(sql).toMatch(/OFFSET/i);
      expect(params).toContain(10);
      expect(params).toContain(5);
    });
  });
});
