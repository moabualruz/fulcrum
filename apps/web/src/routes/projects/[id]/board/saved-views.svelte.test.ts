import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type PageProps = {
  data: {
    activeProjectId: string | null;
    project: { id: string; name: string };
    tasks: [];
    activeSprintId: null;
    view: string;
    savedViews: Array<{
      id: string;
      name: string;
      scope: "private" | "project" | "org";
      viewType: "board" | "list" | "table" | "calendar" | "timeline";
      queryJson: {
        filters: Array<{ field: string; op: string; value?: unknown }>;
        text: string;
        facets: Record<string, string[]>;
      };
      defaultFor: string | null;
    }>;
    transientQuery: {
      filters: Array<{ field: string; op: string; value?: unknown }>;
      text: string;
      facets: Record<string, string[]>;
    };
  };
};

describe("/projects/[id]/board saved views UI", () => {
  let render: typeof import("svelte/server").render;
  let SavedViewFilterBuilder: Component<{
    projectId: string;
    activeView: "board" | "list" | "table" | "calendar" | "timeline";
    query: PageProps["data"]["transientQuery"];
    savedViews: PageProps["data"]["savedViews"];
  }>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("../../../../lib/components/saved-views/SavedViewFilterBuilder.svelte")) as unknown as {
      default: typeof SavedViewFilterBuilder;
    };
    SavedViewFilterBuilder = mod.default;
  });

  test("renders filter chips and save-as-view form with query_json round-trip", () => {
    const query = {
      filters: [{ field: "status", op: "eq", value: "blocked" }],
      text: "",
      facets: { assignee: ["user-1"] },
    };

    const { body } = render(SavedViewFilterBuilder, {
      props: {
        projectId: "project-1",
        activeView: "board",
        savedViews: [],
        query,
      },
    });

    expect(body).toContain("data-saved-view-filter-builder");
    expect(body).toContain("data-filter-chip");
    expect(body).toContain("status eq blocked");
    expect(body).toContain('name="intent" value="savedViews.create"');
    expect(body).toContain('name="query_json"');
    expect(body).toContain(encodeURIComponent(JSON.stringify(query)));
  });

  test("renders saved view links with scope badges", () => {
    const { body } = render(SavedViewFilterBuilder, {
      props: {
        projectId: "project-1",
        activeView: "board",
        query: { filters: [], text: "", facets: {} },
        savedViews: [
          {
            id: "view-1",
            name: "Blocked table",
            scope: "project",
            viewType: "table",
            defaultFor: "tasks",
            queryJson: {
              filters: [{ field: "status", op: "eq", value: "blocked" }],
              text: "",
              facets: {},
            },
          },
        ],
      },
    });

    expect(body).toContain("data-saved-view-list");
    expect(body).toContain("Blocked table");
    expect(body).toContain("project");
    expect(body).toMatch(/href="\/projects\/project-1\/table\?view=[^"]+savedView=view-1/);
  });
});
