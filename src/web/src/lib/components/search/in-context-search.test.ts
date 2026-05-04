import { describe, expect, test } from "bun:test";

import { buildSearchQueryInput, filterItemsForSearchResults, parseQuickFilterTokens } from "./in-context-search";

describe("in-context search helpers", () => {
  test("buildSearchQueryInput passes kind and projectId through to search.query input", () => {
    expect(buildSearchQueryInput({
      kind: "task",
      projectId: "project-1",
      value: "status:open assignee:mkh kernel",
    })).toEqual({
      q: "kernel",
      kind: "task",
      projectId: "project-1",
      status: "open",
      assigneeId: "mkh",
      limit: 20,
    });
  });

  test("parseQuickFilterTokens extracts supported tokens and leaves free text query", () => {
    expect(parseQuickFilterTokens("doc_type:runbook status:published search plan")).toEqual({
      q: "search plan",
      filters: { docType: "runbook", status: "published" },
    });
  });

  test("filterItemsForSearchResults replaces list while query is active and restores on empty query", () => {
    const items = [{ id: "task-1" }, { id: "task-2" }];
    const results = [{ entityId: "task-2" }];

    expect(filterItemsForSearchResults(items, results, "kernel")).toEqual([{ id: "task-2" }]);
    expect(filterItemsForSearchResults(items, results, "")).toEqual(items);
  });
});
