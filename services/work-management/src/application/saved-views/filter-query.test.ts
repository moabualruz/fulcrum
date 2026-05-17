import { describe, expect, test } from "bun:test";
import {
  FilterClauseSchema,
  OrderByClauseSchema,
  SavedViewQuerySchema,
  compileSavedViewQuery,
  type SavedViewQuery,
} from "./filter-query.ts";

describe("SavedViewQuerySchema", () => {
  test("parses a complete query", () => {
    const result = SavedViewQuerySchema.parse({
      filters: [{ field: "status", op: "eq", value: "done" }],
      text: "hello",
      facets: { status: ["done", "todo"], priority: ["high"] },
    });
    expect(result.filters).toHaveLength(1);
    expect(result.text).toBe("hello");
    expect(result.facets.status).toEqual(["done", "todo"]);
  });

  test("defaults to empty filters, text and facets when input is empty object", () => {
    const result = SavedViewQuerySchema.parse({});
    expect(result.filters).toEqual([]);
    expect(result.text).toBe("");
    expect(result.facets).toEqual({});
  });

  test("rejects invalid operator in filter clause", () => {
    expect(() =>
      FilterClauseSchema.parse({ field: "status", op: "startsWith", value: "x" })
    ).toThrow();
  });

  test("rejects missing field in filter clause", () => {
    expect(() =>
      FilterClauseSchema.parse({ op: "eq", value: "done" })
    ).toThrow();
  });

  test("round-trips through JSON serialization", () => {
    const q: SavedViewQuery = {
      filters: [{ field: "status", op: "in", value: ["todo", "done"] }],
      text: "my search",
      facets: { sprint: ["sprint-1"] },
    };
    const parsed = SavedViewQuerySchema.parse(JSON.parse(JSON.stringify(q)));
    expect(parsed).toEqual(q);
  });
});

describe("OrderByClauseSchema", () => {
  test("parses valid asc clause", () => {
    expect(OrderByClauseSchema.parse({ field: "createdAt", dir: "asc" })).toEqual({
      field: "createdAt",
      dir: "asc",
    });
  });

  test("parses valid desc clause", () => {
    expect(OrderByClauseSchema.parse({ field: "priority", dir: "desc" })).toEqual({
      field: "priority",
      dir: "desc",
    });
  });

  test("rejects invalid direction", () => {
    expect(() =>
      OrderByClauseSchema.parse({ field: "createdAt", dir: "ASCENDING" })
    ).toThrow();
  });

  test("rejects missing field", () => {
    expect(() => OrderByClauseSchema.parse({ dir: "asc" })).toThrow();
  });
});

describe("compileSavedViewQuery", () => {
  test("empty query returns empty filter object", () => {
    const q: SavedViewQuery = { filters: [], text: "", facets: {} };
    expect(compileSavedViewQuery(q)).toEqual({});
  });

  test("text compiles to title LIKE fallback", () => {
    const q: SavedViewQuery = { filters: [], text: "bug fix", facets: {} };
    const result = compileSavedViewQuery(q);
    expect(result).toMatchObject({ title: { $like: "%bug fix%" } });
  });

  test("empty text does not add title condition", () => {
    const q: SavedViewQuery = { filters: [], text: "", facets: {} };
    const result = compileSavedViewQuery(q) as Record<string, unknown>;
    expect(result["title"]).toBeUndefined();
  });

  test("op eq compiles to direct field value", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "status", op: "eq", value: "done" }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({ status: "done" });
  });

  test("op neq compiles to $ne", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "status", op: "neq", value: "cancelled" }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({ status: { $ne: "cancelled" } });
  });

  test("op in compiles to $in", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "status", op: "in", value: ["todo", "in_progress"] }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({
      status: { $in: ["todo", "in_progress"] },
    });
  });

  test("op nin compiles to $nin", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "status", op: "nin", value: ["done", "cancelled"] }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({
      status: { $nin: ["done", "cancelled"] },
    });
  });

  test("op gt compiles to $gt", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "priority", op: "gt", value: 2 }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({ priority: { $gt: 2 } });
  });

  test("op lt compiles to $lt", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "priority", op: "lt", value: 5 }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({ priority: { $lt: 5 } });
  });

  test("op contains compiles to $like with wildcards", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "title", op: "contains", value: "auth" }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({ title: { $like: "%auth%" } });
  });

  test("op is_empty compiles to $eq null", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "externalId", op: "is_empty" }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({ externalId: { $eq: null } });
  });

  test("op is_not_empty compiles to $ne null", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "externalId", op: "is_not_empty" }],
    });
    expect(compileSavedViewQuery(q)).toMatchObject({ externalId: { $ne: null } });
  });

  test("facet status compiles to $in on status field", () => {
    const q: SavedViewQuery = {
      filters: [],
      text: "",
      facets: { status: ["todo", "in_progress"] },
    };
    expect(compileSavedViewQuery(q)).toMatchObject({
      status: { $in: ["todo", "in_progress"] },
    });
  });

  test("facet priority compiles to $in on priority field", () => {
    const q: SavedViewQuery = {
      filters: [],
      text: "",
      facets: { priority: ["high", "urgent"] },
    };
    expect(compileSavedViewQuery(q)).toMatchObject({
      priority: { $in: ["high", "urgent"] },
    });
  });

  test("facet assignee compiles to $in on assigneeId field", () => {
    const q: SavedViewQuery = {
      filters: [],
      text: "",
      facets: { assignee: ["user-uuid-1", "user-uuid-2"] },
    };
    expect(compileSavedViewQuery(q)).toMatchObject({
      assigneeId: { $in: ["user-uuid-1", "user-uuid-2"] },
    });
  });

  test("facet sprint compiles to $in on sprint field", () => {
    const q: SavedViewQuery = {
      filters: [],
      text: "",
      facets: { sprint: ["sprint-uuid-1"] },
    };
    expect(compileSavedViewQuery(q)).toMatchObject({
      sprint: { $in: ["sprint-uuid-1"] },
    });
  });

  test("custom_fields slug path compiles to jsonb $contains", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "custom_fields.color", op: "eq", value: "red" }],
    });
    const result = compileSavedViewQuery(q);
    // custom_fields->>'color' = 'red' compiled as jsonb $contains {color: 'red'}
    expect(result).toMatchObject({ customFields: { $contains: { color: "red" } } });
  });

  test("multiple filters combine with $and", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [
        { field: "status", op: "eq", value: "done" },
        { field: "priority", op: "gt", value: 2 },
      ],
    });
    const result = compileSavedViewQuery(q) as { $and: unknown[] };
    expect(Array.isArray(result.$and)).toBe(true);
    expect(result.$and).toHaveLength(2);
  });

  test("filter + text + facets all present combines with $and", () => {
    const q: SavedViewQuery = {
      filters: [{ field: "status", op: "eq", value: "done" }],
      text: "search",
      facets: { sprint: ["sprint-1"] },
    };
    const result = compileSavedViewQuery(q) as { $and: unknown[] };
    expect(Array.isArray(result.$and)).toBe(true);
    expect(result.$and.length).toBeGreaterThanOrEqual(3);
  });

  test("empty facet arrays are ignored", () => {
    const q: SavedViewQuery = {
      filters: [],
      text: "",
      facets: { status: [], sprint: ["s1"] },
    };
    const result = compileSavedViewQuery(q) as Record<string, unknown>;
    // empty status array → not added; sprint still added
    expect(result["status"]).toBeUndefined();
    expect(result).toMatchObject({ sprint: { $in: ["s1"] } });
  });
});

describe("SavedViewQuery round-trip", () => {
  /**
   * Simulates: create AST → serialize to SavedView.queryJson → reload →
   * re-parse → compile → verify structure.
   * No DB required — the queryJson column stores JSON; round-trip is pure.
   */

  test("round-trip through JSON (simulating SavedView.queryJson persist/load)", () => {
    const original: SavedViewQuery = {
      filters: [
        { field: "status", op: "in", value: ["todo", "in_progress"] },
        { field: "priority", op: "gt", value: 1 },
      ],
      text: "search term",
      facets: { sprint: ["sprint-abc"] },
    };

    // Simulate DB persist → load (JSON serialise/deserialise)
    const persisted = JSON.stringify(original);
    const reloaded = SavedViewQuerySchema.parse(JSON.parse(persisted));

    // Structure must survive round-trip
    expect(reloaded.filters).toHaveLength(2);
    expect(reloaded.filters[0]).toEqual({ field: "status", op: "in", value: ["todo", "in_progress"] });
    expect(reloaded.filters[1]).toEqual({ field: "priority", op: "gt", value: 1 });
    expect(reloaded.text).toBe("search term");
    expect(reloaded.facets.sprint).toEqual(["sprint-abc"]);

    // Compiled query must produce $and with all conditions
    const compiled = compileSavedViewQuery(reloaded) as { $and: unknown[] };
    expect(Array.isArray(compiled.$and)).toBe(true);
    // text + sprint facet + 2 filters = 4 conditions
    expect(compiled.$and.length).toBe(4);
  });

  test("single-filter query round-trips without $and wrapper", () => {
    const original: SavedViewQuery = {
      filters: [{ field: "title", op: "contains", value: "auth" }],
      text: "",
      facets: {},
    };
    const reloaded = SavedViewQuerySchema.parse(JSON.parse(JSON.stringify(original)));
    const compiled = compileSavedViewQuery(reloaded);
    // Single filter → no $and
    expect(compiled).toMatchObject({ title: { $like: "%auth%" } });
    expect((compiled as Record<string, unknown>)["$and"]).toBeUndefined();
  });

  test("empty query round-trips to empty compiled filter", () => {
    const original: SavedViewQuery = { filters: [], text: "", facets: {} };
    const reloaded = SavedViewQuerySchema.parse(JSON.parse(JSON.stringify(original)));
    expect(compileSavedViewQuery(reloaded)).toEqual({});
  });

  test("all built-in operators survive round-trip", () => {
    const ops = [
      { field: "f1", op: "eq" as const, value: "v1" },
      { field: "f2", op: "neq" as const, value: "v2" },
      { field: "f3", op: "in" as const, value: ["a", "b"] },
      { field: "f4", op: "nin" as const, value: ["c"] },
      { field: "f5", op: "gt" as const, value: 5 },
      { field: "f6", op: "lt" as const, value: 10 },
      { field: "f7", op: "contains" as const, value: "hello" },
      { field: "f8", op: "is_empty" as const },
      { field: "f9", op: "is_not_empty" as const },
    ];
    const original: SavedViewQuery = { filters: ops, text: "", facets: {} };
    const reloaded = SavedViewQuerySchema.parse(JSON.parse(JSON.stringify(original)));
    expect(reloaded.filters).toHaveLength(9);
    reloaded.filters.forEach((f, i) => {
      expect(f.op).toBe(ops[i]!.op);
    });
    // All 9 compile without throwing
    const compiled = compileSavedViewQuery(reloaded) as { $and: unknown[] };
    expect(compiled.$and).toHaveLength(9);
  });
});

describe("AND/OR combinator patterns", () => {
  test("multiple filters produce $and conditions array", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [
        { field: "status", op: "eq", value: "done" },
        { field: "assigneeId", op: "eq", value: "user-1" },
        { field: "priority", op: "lt", value: 3 },
      ],
    });
    const result = compileSavedViewQuery(q) as { $and: unknown[] };
    expect(result.$and).toHaveLength(3);
    expect(result.$and).toContainEqual({ status: "done" });
    expect(result.$and).toContainEqual({ assigneeId: "user-1" });
    expect(result.$and).toContainEqual({ priority: { $lt: 3 } });
  });

  test("facet + filter combination produces $and", () => {
    const q: SavedViewQuery = {
      filters: [{ field: "title", op: "contains", value: "bug" }],
      text: "",
      facets: { status: ["todo"] },
    };
    const result = compileSavedViewQuery(q) as { $and: unknown[] };
    expect(Array.isArray(result.$and)).toBe(true);
    expect(result.$and).toContainEqual({ title: { $like: "%bug%" } });
    expect(result.$and).toContainEqual({ status: { $in: ["todo"] } });
  });
});

describe("custom field reference filters", () => {
  test("custom_fields.fieldId eq compiles to jsonb $contains", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "custom_fields.cf-123", op: "eq", value: "blue" }],
    });
    const result = compileSavedViewQuery(q);
    expect(result).toMatchObject({ customFields: { $contains: { "cf-123": "blue" } } });
  });

  test("custom_fields.fieldId neq compiles to $not $contains", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "custom_fields.cf-abc", op: "neq", value: "red" }],
    });
    const result = compileSavedViewQuery(q);
    expect(result).toMatchObject({ customFields: { $not: { $contains: { "cf-abc": "red" } } } });
  });

  test("custom_fields.fieldId in compiles to $or of $contains", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "custom_fields.cf-select", op: "in", value: ["opt1", "opt2"] }],
    });
    const result = compileSavedViewQuery(q);
    expect(result).toMatchObject({
      customFields: {
        $or: [
          { $contains: { "cf-select": "opt1" } },
          { $contains: { "cf-select": "opt2" } },
        ],
      },
    });
  });

  test("custom_fields.fieldId is_empty compiles correctly", () => {
    const q = SavedViewQuerySchema.parse({
      filters: [{ field: "custom_fields.cf-date", op: "is_empty" }],
    });
    const result = compileSavedViewQuery(q);
    expect(result).toMatchObject({ customFields: { $not: { $contains: { "cf-date": null } } } });
  });

  test("custom field filter round-trips through JSON", () => {
    const original: SavedViewQuery = {
      filters: [
        { field: "custom_fields.priority_score", op: "gt", value: 50 },
        { field: "custom_fields.team_tag", op: "eq", value: "frontend" },
      ],
      text: "",
      facets: {},
    };
    const reloaded = SavedViewQuerySchema.parse(JSON.parse(JSON.stringify(original)));
    expect(reloaded.filters).toHaveLength(2);
    expect(reloaded.filters[0]!.field).toBe("custom_fields.priority_score");
    expect(reloaded.filters[1]!.field).toBe("custom_fields.team_tag");

    // Compiled output includes both custom field conditions
    const compiled = compileSavedViewQuery(reloaded) as { $and: unknown[] };
    expect(compiled.$and).toHaveLength(2);
    // Both entries reference customFields key
    const keys = (compiled.$and as Record<string, unknown>[]).map((c) => Object.keys(c)[0]);
    expect(keys).toEqual(["customFields", "customFields"]);
  });

  test("mixed built-in and custom field filters round-trip", () => {
    const original: SavedViewQuery = {
      filters: [
        { field: "status", op: "eq", value: "in_progress" },
        { field: "custom_fields.effort", op: "lt", value: 8 },
        { field: "custom_fields.team", op: "in", value: ["eng", "design"] },
      ],
      text: "feature",
      facets: { assignee: ["user-42"] },
    };
    const reloaded = SavedViewQuerySchema.parse(JSON.parse(JSON.stringify(original)));
    const compiled = compileSavedViewQuery(reloaded) as { $and: unknown[] };
    // text + assignee facet + 3 filters = 5
    expect(compiled.$and).toHaveLength(5);
  });
});
