import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type PageProps = {
  data: {
    activeProjectId: string | null;
    project: { id: string; name: string };
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      priority: number;
      project_id: string;
      updated_at: string;
      created_at: string;
      start_date?: string | null;
      due_date?: string | null;
      blocks?: string[];
    }>;
    activeSprintId: null;
    activeSprint?: null;
    month?: string;
    view: string;
  };
};

describe("/projects/[id]/board +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as unknown as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders project view switcher and kanban board", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          project: { id: "project-1", name: "Alpha" },
          tasks: [],
          activeSprintId: null,
          view: "board",
        },
      },
    });

    expect(body).toMatch(/data-project-view-switcher/);
    expect(body).toMatch(/data-project-view="board"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-kanban-board/);
  });

  test("renders timeline view with task bars and dependency arrows", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          project: { id: "project-1", name: "Alpha" },
          activeSprintId: null,
          activeSprint: null,
          view: "timeline",
          tasks: [
            {
              id: "blocker",
              title: "Blocker",
              status: "pending",
              priority: 1,
              project_id: "project-1",
              updated_at: "2026-01-01T00:00:00Z",
              created_at: "2026-01-01T00:00:00Z",
              start_date: "2026-01-01",
              due_date: "2026-01-04",
              blocks: ["blocked"],
            },
            {
              id: "blocked",
              title: "Blocked",
              status: "pending",
              priority: 1,
              project_id: "project-1",
              updated_at: "2026-01-01T00:00:00Z",
              created_at: "2026-01-01T00:00:00Z",
              start_date: "2026-01-08",
              due_date: "2026-01-10",
            },
          ],
        },
      },
    });

    expect(body).toMatch(/data-task-timeline/);
    expect(body).toMatch(/data-timeline-bar[^>]*data-task-id="blocker"/);
    expect(body).toMatch(/data-timeline-dependency[^>]*data-from="blocker"[^>]*data-to="blocked"/);
    expect(body).toMatch(/<path\b/);
  });
});
