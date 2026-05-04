import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type PageProps = {
  data: {
    project: { id: string; name: string };
    views: Array<{
      id: string;
      name: string;
      scope: "private" | "project" | "org";
      viewType: "board" | "list" | "table" | "calendar" | "timeline";
      defaultFor: string | null;
    }>;
  };
};

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

  test("lists saved views with scope badges and CRUD forms", () => {
    const { body } = render(Page, {
      props: {
        data: {
          project: { id: "project-1", name: "Alpha" },
          views: [
            { id: "view-1", name: "My blocked", scope: "private", viewType: "board", defaultFor: null },
            { id: "view-2", name: "Org backlog", scope: "org", viewType: "table", defaultFor: "tasks" },
          ],
        },
      },
    });

    expect(body).toContain("data-saved-views-settings");
    expect(body).toContain("My blocked");
    expect(body).toContain("Org backlog");
    expect(body).toContain('name="intent" value="savedViews.setDefault"');
    expect(body).toContain('name="intent" value="savedViews.updateScope"');
    expect(body).toContain('name="intent" value="savedViews.delete"');
    expect(body).toContain("Default");
  });
});
