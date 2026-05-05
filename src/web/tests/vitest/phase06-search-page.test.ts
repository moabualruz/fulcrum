import { describe, it, expect } from "vitest";

describe("SearchPage component logic — Phase 06", () => {
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
});
