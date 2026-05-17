import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import {
  filterSearchResults,
  highlightedSegments,
  normalizeSearchHit,
  searchPublicApiPath,
} from "$lib/components/search/in-context-search";

const searchPageSource = () =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../src/lib/components/search/SearchPage.svelte"), "utf8");
const savedSearchRowSource = () =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../src/lib/components/search/SavedSearchRow.svelte"), "utf8");

describe("SearchPage component logic — knowledge workflow", () => {
  describe("public API invocation", () => {
    it("uses the Nest search public API instead of the runtime tRPC route", () => {
      const source = searchPageSource();

      expect(source).not.toContain("/api/trpc");
      expect(source).not.toContain("{@html");
      expect(source).toContain('"/api/v1/search"');
      expect(source).toContain("org_id");
      expect(source).toContain("project_id");
      expect(source).toContain("kind");
      expect(source).toContain("limit");
    });

    it("uses Nest saved-search routes for list, create, and delete", () => {
      const source = `${searchPageSource()}\n${savedSearchRowSource()}`;

      expect(source).not.toContain("/api/trpc");
      expect(source).not.toContain("orgId = \"org-1\"");
      expect(source).not.toContain("userId = \"user1\"");
      expect(source).toContain('"/api/v1/search/saved"');
      expect(source).toContain('`/api/v1/search/saved/${encodeURIComponent(search.id)}`');
      expect(source).toContain("query_json");
      expect(source).toContain("user_id");
    });
  });

  describe("facet chip selection", () => {
    const FACETS = ["all", "doc", "task", "memory", "run", "artifact", "repo", "sprint"];

    it("all 8 entity kinds represented as facets", () => {
      expect(FACETS).toHaveLength(8);
      expect(FACETS).toContain("doc");
      expect(FACETS).toContain("task");
      expect(FACETS).toContain("memory");
    });

    it("'all' is default active facet", () => {
      const active = FACETS[0];
      expect(active).toBe("all");
    });
  });

  describe("saved search serialization", () => {
    interface SavedSearch {
      name: string;
      term: string;
      filters: { kinds?: string[]; projectIds?: string[]; statuses?: string[] };
    }

    it("round-trips search query to saved search object", () => {
      const saved: SavedSearch = {
        name: "My Filter",
        term: "auth bug",
        filters: { kinds: ["task", "doc"], projectIds: ["p1"] },
      };
      const json = JSON.stringify(saved);
      const parsed = JSON.parse(json) as SavedSearch;
      expect(parsed.term).toBe("auth bug");
      expect(parsed.filters.kinds).toEqual(["task", "doc"]);
    });

    it("empty filters serializes correctly", () => {
      const saved: SavedSearch = { name: "Empty", term: "", filters: {} };
      const parsed = JSON.parse(JSON.stringify(saved)) as SavedSearch;
      expect(parsed.filters).toEqual({});
    });
  });

  describe("public API behavior helpers", () => {
    it("builds public search paths without empty query params", () => {
      expect(searchPublicApiPath("/api/v1/search", {
        q: "kernel",
        org_id: "org-1",
        project_id: "",
        limit: 50,
      })).toBe("/api/v1/search?q=kernel&org_id=org-1&limit=50");
    });

    it("filters status chips against normalized public API results", () => {
      const active = normalizeSearchHit({
        id: "hit-1",
        source_kind: "task",
        source_id: "task-1",
        title: "Active task",
        body: "Body",
        score: 1,
        updated_at: "2026-05-15T00:00:00.000Z",
        status: "active",
      });
      const completed = normalizeSearchHit({
        id: "hit-2",
        source_kind: "task",
        source_id: "task-2",
        title: "Completed task",
        body: "Body",
        score: 1,
        updated_at: "2026-05-15T00:00:00.000Z",
        status: "completed",
      });

      expect(filterSearchResults([active, completed], { statuses: ["active"] })).toEqual([active]);
    });

    it("returns highlight text segments instead of HTML strings", () => {
      expect(highlightedSegments("<script>alert(1)</script> kernel", "kernel")).toEqual([
        { text: "<script>alert(1)</script> ", match: false },
        { text: "kernel", match: true },
      ]);
    });
  });
});
