/**
 * Tests for SearchQueryService — PGlite FTS query with facets.
 * These tests run against a mock ProductDb.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SearchQueryService } from "./query-service.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";

function makeDb(rows: Record<string, unknown>[] = []): ProductDb {
  return {
    query: vi.fn().mockResolvedValue(rows),
  } as unknown as ProductDb;
}

describe("SearchQueryService", () => {
  let svc: SearchQueryService;

  describe("query() — empty term", () => {
    it("returns empty results without hitting DB when term is blank", async () => {
      const db = makeDb([{ id: "1" }]);
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "   " });
      expect(result).toEqual({ results: [], total: 0 });
      expect((db.query as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
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

    it("Test 1: returns results with rank field from ts_rank", async () => {
      const db = makeDb(fakeRows);
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "test" });
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toHaveProperty("rank");
      expect(result.results[0]!.rank).toBeGreaterThanOrEqual(0);
    });

    it("Test 2: filters by entityKind when kinds filter is provided", async () => {
      const db = makeDb(fakeRows);
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "test", filters: { kinds: ["doc"] } });
      expect(result.results).toHaveLength(1);
      // ensure SQL was called with kinds filter (check db.query was called)
      expect((db.query as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      const sql: string = (db.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sql).toMatch(/entity_kind/i);
    });

    it("Test 3: returns facetCounts when facets=true", async () => {
      // First call returns main results, subsequent calls return facet aggregates
      const db = {
        query: vi.fn()
          .mockResolvedValueOnce(fakeRows)
          .mockResolvedValueOnce([{ value: "doc", count: "1" }])
          .mockResolvedValueOnce([{ value: "p1", count: "1" }])
          .mockResolvedValueOnce([]),
      } as unknown as ProductDb;
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "test", facets: true });
      expect(result.facets).toBeDefined();
      expect(result.facets).toHaveProperty("kind");
      expect(result.facets).toHaveProperty("project");
      expect(result.facets).toHaveProperty("status");
    });

    it("Test 4: empty term returns empty results without DB scan", async () => {
      const db = makeDb();
      svc = new SearchQueryService(db);
      const result = await svc.query("org1", { term: "" });
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("Test 5: respects limit and offset for pagination", async () => {
      const db = makeDb(fakeRows);
      svc = new SearchQueryService(db);
      await svc.query("org1", { term: "test", limit: 10, offset: 5 });
      const sql: string = (db.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const params: unknown[] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(sql).toMatch(/LIMIT/i);
      expect(sql).toMatch(/OFFSET/i);
      expect(params).toContain(10);
      expect(params).toContain(5);
    });
  });
});
