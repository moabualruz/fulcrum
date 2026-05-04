import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type PageProps = {
  data: {
    activeProjectId: string | null;
    project: { id: string; name: string };
    tasks: [];
    view?: "board" | "list" | "table" | "calendar";
    activeSprintId: null;
  };
};

describe("/projects/[id]/board list view", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as unknown as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders task list when view=list", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          project: { id: "project-1", name: "Alpha" },
          tasks: [],
          activeSprintId: null,
          view: "list",
        },
      },
    });

    expect(body).toMatch(/data-project-view="list"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-task-list/);
  });

  test("renders task table when view=table", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          project: { id: "project-1", name: "Alpha" },
          tasks: [],
          activeSprintId: null,
          view: "table",
        },
      },
    });

    expect(body).toMatch(/data-project-view="table"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-task-table/);
  });

  test("renders task calendar when view=calendar", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          project: { id: "project-1", name: "Alpha" },
          tasks: [],
          activeSprintId: null,
          view: "calendar",
        },
      },
    });

    expect(body).toMatch(/data-project-view="calendar"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-task-calendar/);
  });
});
