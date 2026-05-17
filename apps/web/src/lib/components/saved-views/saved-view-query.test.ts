import { describe, expect, test } from "bun:test";
import {
  decodeSavedViewParam,
  encodeSavedViewParam,
  filterChipLabel,
  savedViewHref,
  type SavedViewQuery,
} from "./saved-view-query";

describe("saved view query helpers", () => {
  test("URL param encoding and decoding preserves all AST fields", () => {
    const query: SavedViewQuery = {
      filters: [
        { field: "status", op: "eq", value: "blocked" },
        { field: "priority", op: "gt", value: 2 },
        { field: "label", op: "in", value: ["bug", "p1"] },
      ],
      text: "oauth callback",
      facets: {
        status: ["blocked"],
        assignee: ["user-1"],
        label: ["bug"],
        repo: ["repo-1"],
      },
    };

    expect(decodeSavedViewParam(encodeSavedViewParam(query))).toEqual(query);
  });

  test("chip labels show field op value", () => {
    expect(filterChipLabel({ field: "status", op: "eq", value: "blocked" })).toBe("status eq blocked");
    expect(filterChipLabel({ field: "externalId", op: "is_empty" })).toBe("externalId is_empty");
  });

  test("saved view href navigates to view type route and applies encoded query", () => {
    const query: SavedViewQuery = {
      filters: [{ field: "status", op: "eq", value: "in_progress" }],
      text: "",
      facets: {},
    };

    const href = savedViewHref("project-1", { id: "view-1", viewType: "table", queryJson: query });

    expect(href.startsWith("/projects/project-1/table?view=")).toBe(true);
    expect(href).toContain("savedView=view-1");
    expect(decodeSavedViewParam(new URL(`http://local${href}`).searchParams.get("view"))).toEqual(query);
  });
});
