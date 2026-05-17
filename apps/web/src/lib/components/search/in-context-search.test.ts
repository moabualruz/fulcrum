import { describe, expect, test } from "bun:test";

import {
  buildSearchFacets,
  buildSearchQueryInput,
  filterSearchResults,
  filterItemsForSearchResults,
  highlightedSegments,
  normalizeSearchHit,
  parseQuickFilterTokens,
  searchPublicApiPath,
} from "./in-context-search";

describe("in-context search helpers", () => {
  test("buildSearchQueryInput passes kind and projectId through to public API query input", () => {
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

  test("searchPublicApiPath omits empty values and encodes query parameters", () => {
    expect(searchPublicApiPath("/api/v1/search", {
      q: "kernel plan",
      org_id: "org-1",
      project_id: null,
      limit: 20,
    })).toBe("/api/v1/search?q=kernel+plan&org_id=org-1&limit=20");
  });

  test("normalizeSearchHit preserves optional project and status facets", () => {
    const row = normalizeSearchHit({
      id: "entry-1",
      source_kind: "task",
      source_id: "task-1",
      title: "Fix kernel",
      body: "Kernel work",
      score: 1,
      updated_at: "2026-05-15T00:00:00.000Z",
      project_id: "project-1",
      status: "active",
      labels: ["backend"],
    });

    expect(row).toMatchObject({
      entityKind: "task",
      entityId: "task-1",
      projectId: "project-1",
      status: "active",
      labels: ["backend"],
    });
    expect(buildSearchFacets([row])).toEqual({
      kind: { task: 1 },
      project: { "project-1": 1 },
      status: { active: 1 },
    });
  });

  test("filterSearchResults applies status filters after public API search", () => {
    const rows = [
      normalizeSearchHit({
        id: "entry-1",
        source_kind: "task",
        source_id: "task-1",
        title: "Active task",
        body: "Body",
        score: 1,
        updated_at: "2026-05-15T00:00:00.000Z",
        status: "active",
      }),
      normalizeSearchHit({
        id: "entry-2",
        source_kind: "task",
        source_id: "task-2",
        title: "Done task",
        body: "Body",
        score: 1,
        updated_at: "2026-05-15T00:00:00.000Z",
        status: "completed",
      }),
    ];

    expect(filterSearchResults(rows, { statuses: ["active"] }).map((row) => row.entityId)).toEqual(["task-1"]);
  });

  test("highlightedSegments returns text segments instead of HTML strings", () => {
    expect(highlightedSegments("<img src=x onerror=alert(1)> kernel", "kernel")).toEqual([
      { text: "<img src=x onerror=alert(1)> ", match: false },
      { text: "kernel", match: true },
    ]);
  });
});
