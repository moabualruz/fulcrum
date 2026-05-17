/**
 * Natural-language filter translation tests.
 */

import { describe, expect, test } from "bun:test";
import {
  type NlFilterSidecar,
  translateNlToFilter,
  plainTextFallback,
} from "./nl-filter.ts";
import type { SavedViewQuery } from "@work-management/application/saved-views/filter-query.ts";

// ─── Mock sidecar ──────────────────────────────────────────────────────────

class MockSidecar implements NlFilterSidecar {
  constructor(private readonly response: SavedViewQuery) {}
  async translate(_query: string): Promise<SavedViewQuery> {
    return this.response;
  }
}

class TimeoutSidecar implements NlFilterSidecar {
  async translate(_query: string): Promise<SavedViewQuery> {
    await new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error("timeout")), 10),
    );
    throw new Error("unreachable");
  }
}

class ErrorSidecar implements NlFilterSidecar {
  async translate(_query: string): Promise<SavedViewQuery> {
    throw new Error("sidecar unavailable");
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("NL→filter translation", () => {
  test("flag OFF → plainTextFallback wraps query as text-only AST", () => {
    const result = plainTextFallback("docs about deployment last week");
    expect(result.text).toBe("docs about deployment last week");
    expect(result.filters).toEqual([]);
    expect(result.facets).toEqual({});
  });

  test("flag ON + sidecar mock → AST injected into result", async () => {
    const mockAst: SavedViewQuery = {
      filters: [{ field: "source_kind", op: "eq", value: "doc" }],
      text: "deployment",
      facets: { kind: ["doc"] },
    };
    const sidecar = new MockSidecar(mockAst);
    const result = await translateNlToFilter("docs about deployment last week", sidecar);

    expect(result.translated).toBe(true);
    expect(result.ast).not.toBeNull();
    expect(result.ast!.text).toBe("deployment");
    expect(result.ast!.filters).toHaveLength(1);
    expect(result.ast!.filters[0]!.field).toBe("source_kind");
    expect(result.ast!.facets.kind).toEqual(["doc"]);
  });

  test("sidecar timeout → plain-text fallback, no error thrown", async () => {
    const sidecar = new TimeoutSidecar();
    const result = await translateNlToFilter("show me tasks", sidecar);

    expect(result.translated).toBe(false);
    expect(result.ast).toBeNull();
    expect(result.originalQuery).toBe("show me tasks");
  });

  test("sidecar error → plain-text fallback, no error thrown", async () => {
    const sidecar = new ErrorSidecar();
    const result = await translateNlToFilter("anything", sidecar);

    expect(result.translated).toBe(false);
    expect(result.ast).toBeNull();
  });

  test("originalQuery preserved in all cases", async () => {
    const query = "show tasks assigned to me last sprint";
    const sidecar = new MockSidecar({ filters: [], text: "tasks", facets: {} });
    const result = await translateNlToFilter(query, sidecar);
    expect(result.originalQuery).toBe(query);
  });
});
