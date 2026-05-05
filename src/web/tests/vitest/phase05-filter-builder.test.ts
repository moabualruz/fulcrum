import { describe, it, expect } from "vitest";
import {
  normalizeSavedViewQuery,
  emptySavedViewQuery,
  encodeSavedViewParam,
  decodeSavedViewParam,
  filterChipLabel,
  type FilterClause,
  type SavedViewQuery,
} from "../../src/lib/components/saved-views/saved-view-query.js";

describe("FilterBuilder — Phase 05", () => {
  it("emptySavedViewQuery returns blank structure", () => {
    const q = emptySavedViewQuery();
    expect(q.filters).toEqual([]);
    expect(q.text).toBe("");
    expect(q.facets).toEqual({});
  });

  it("normalizeSavedViewQuery strips invalid filters", () => {
    const raw = {
      filters: [
        { field: "status", op: "eq", value: "open" },
        null,
        { broken: true },
        { field: "priority", op: "gte", value: 3 },
      ],
      text: "search term",
      facets: { labels: ["bug", "urgent"] },
    };
    const result = normalizeSavedViewQuery(raw);
    expect(result.filters.length).toBe(2);
    expect(result.filters[0].field).toBe("status");
    expect(result.filters[1].field).toBe("priority");
    expect(result.text).toBe("search term");
    expect(result.facets.labels).toEqual(["bug", "urgent"]);
  });

  it("normalizeSavedViewQuery handles null/undefined input", () => {
    expect(normalizeSavedViewQuery(null)).toEqual(emptySavedViewQuery());
    expect(normalizeSavedViewQuery(undefined)).toEqual(emptySavedViewQuery());
    expect(normalizeSavedViewQuery(42)).toEqual(emptySavedViewQuery());
  });

  it("encode/decode roundtrip preserves query", () => {
    const query: SavedViewQuery = {
      filters: [{ field: "assignee", op: "eq", value: "user-1" }],
      text: "my tasks",
      facets: { status: ["open", "in_progress"] },
    };
    const encoded = encodeSavedViewParam(query);
    const decoded = decodeSavedViewParam(encoded);
    expect(decoded).toEqual(query);
  });

  it("decodeSavedViewParam handles invalid base64", () => {
    expect(decodeSavedViewParam("!!!invalid")).toEqual(emptySavedViewQuery());
    expect(decodeSavedViewParam(null)).toEqual(emptySavedViewQuery());
  });

  it("filterChipLabel formats clause with value", () => {
    const clause: FilterClause = { field: "priority", op: "gte", value: 3 };
    expect(filterChipLabel(clause)).toBe("priority gte 3");
  });

  it("filterChipLabel formats clause without value", () => {
    const clause: FilterClause = { field: "assignee", op: "is_empty" };
    expect(filterChipLabel(clause)).toBe("assignee is_empty");
  });

  it("filterChipLabel formats array value as comma-separated", () => {
    const clause: FilterClause = { field: "labels", op: "in", value: ["bug", "urgent"] };
    expect(filterChipLabel(clause)).toBe("labels in bug, urgent");
  });
});
