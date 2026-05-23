import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

type SavedViewRow = {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  scope: "private" | "project" | "org";
  owner_id: string | null;
  filters: Record<string, unknown>;
  sort_by: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type PageProps = {
  data: {
    projectId: string;
    views: SavedViewRow[];
  };
};

function row(overrides: Partial<SavedViewRow>): SavedViewRow {
  return {
    id: "view-1",
    org_id: "org-1",
    project_id: "project-1",
    name: "Unnamed",
    scope: "project",
    owner_id: null,
    filters: {},
    sort_by: null,
    is_default: false,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("/projects/[id]/settings/views +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as unknown as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("lists saved views with scope, default state, and CRUD forms", () => {
    const { body } = render(Page, {
      props: {
        data: {
          projectId: "project-1",
          views: [
            row({ id: "view-1", name: "My blocked", scope: "private", is_default: false }),
            row({ id: "view-2", name: "Org backlog", scope: "org", is_default: true }),
          ],
        },
      },
    });

    // Views table renders both rows.
    expect(body).toContain("data-views-table");
    expect(body).toContain("data-view-row");
    expect(body).toContain("My blocked");
    expect(body).toContain("Org backlog");

    // Scope is shown per row.
    expect(body).toContain("private");
    expect(body).toContain("org");

    // Default column reflects is_default.
    expect(body).toContain("Yes");
    expect(body).toContain("No");

    // Create form posts to the create action.
    expect(body).toContain("data-create-view-form");
    expect(body).toContain('action="?/create"');
    expect(body).toContain("data-create-view-submit");

    // Each row exposes a delete form posting to the delete action.
    expect(body).toContain('action="?/delete"');
    expect(body).toContain("data-delete-view");
  });

  test("renders an empty state when there are no saved views", () => {
    const { body } = render(Page, {
      props: {
        data: {
          projectId: "project-1",
          views: [],
        },
      },
    });

    expect(body).toContain("data-empty-views");
    expect(body).not.toContain("data-views-table");
    // Create form is still available even with no existing views.
    expect(body).toContain("data-create-view-form");
  });
});
