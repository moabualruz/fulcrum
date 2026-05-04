import { describe, expect, test } from "bun:test";
import {
  FilterClauseSchema,
  OrderByClauseSchema,
  SavedViewQuerySchema,
  compileSavedViewQuery,
  type SavedViewQuery,
} from "./ast.ts";

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

  test("text compiles to title LIKE (FTS fallback — Pillar 11 swap)", () => {
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
