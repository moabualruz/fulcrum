import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

// The list / table / calendar project views are sibling routes to the board
// (`/projects/[id]/list`, `/table`, `/calendar`). Each route renders the
// shared `ProjectViewSwitcher` plus its view-specific task surface. This file
// verifies each route marks its own tab as the current page and renders the
// view-specific content marker.

type ListPageProps = {
  data: {
    projectId: string;
    project: { id: string; name: string };
    tasks: [];
    streamed: { data: Promise<{ tasks: [] }> | { tasks: [] } };
  };
};

type TablePageProps = {
  data: {
    project: { id: string; name: string };
    tasks: [];
    i18n?: { locale: string };
  };
};

type CalendarPageProps = {
  data: {
    project: { id: string; name: string };
    tasks: [];
    activeSprint: null;
  };
};

describe("/projects/[id] project view routes", () => {
  let render: typeof import("svelte/server").render;
  let ListPage: Component<ListPageProps>;
  let TablePage: Component<TablePageProps>;
  let CalendarPage: Component<CalendarPageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    ListPage = ((await import("../list/+page.svelte")) as unknown as {
      default: Component<ListPageProps>;
    }).default;
    TablePage = ((await import("../table/+page.svelte")) as unknown as {
      default: Component<TablePageProps>;
    }).default;
    CalendarPage = ((await import("../calendar/+page.svelte")) as unknown as {
      default: Component<CalendarPageProps>;
    }).default;
  });

  test("list route renders TaskList with its tab marked current", () => {
    const { body } = render(ListPage, {
      props: {
        data: {
          projectId: "project-1",
          project: { id: "project-1", name: "Alpha" },
          tasks: [],
          streamed: { data: { tasks: [] } },
        },
      },
    });

    expect(body).toMatch(/data-project-view="list"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-task-list/);
  });

  test("table route renders TaskTable with its tab marked current", () => {
    const { body } = render(TablePage, {
      props: {
        data: {
          project: { id: "project-1", name: "Alpha" },
          tasks: [],
          i18n: { locale: "en" },
        },
      },
    });

    expect(body).toMatch(/data-project-view="table"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-task-table/);
  });

  test("calendar route renders CalendarView with its tab marked current", () => {
    const { body } = render(CalendarPage, {
      props: {
        data: {
          project: { id: "project-1", name: "Alpha" },
          tasks: [],
          activeSprint: null,
        },
      },
    });

    expect(body).toMatch(/data-project-view="calendar"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-testid="calendar-grid"/);
  });
});
