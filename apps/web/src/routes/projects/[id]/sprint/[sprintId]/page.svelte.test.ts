import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { svelteTiptapMock } from "$lib/test/svelte-tiptap-mock";

// `mock.module` freezes a module's export-name set on first registration.
// `svelteTiptapMock()` carries every real `svelte-tiptap` export so sibling
// suites that import other names (`NodeViewWrapper`, …) are not frozen out.
mock.module("svelte-tiptap", () => svelteTiptapMock());

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/projects/p1/sprint/sprint-1"),
    params: { id: "p1", sprintId: "sprint-1" },
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  project_id: string | null;
  updated_at: string;
  sprint_id?: string | null;
}

type PageProps = {
  data: {
    project: { id: string; name: string };
    sprint: {
      id: string;
      name: string;
      goal: string | null;
      start_date: string;
      end_date: string;
      status: string;
    };
    tasks: BoardTask[];
  };
};

const SPRINT = {
  id: "sprint-1",
  name: "Sprint 1",
  goal: "Ship active sprint board",
  start_date: "2026-05-01",
  end_date: "2026-05-14",
  status: "active",
};

const TASKS: BoardTask[] = [
  { id: "t1", title: "Sprint task A", status: "pending", priority: 2, project_id: "p1", updated_at: "2026-05-01T00:00:00Z", sprint_id: "sprint-1" },
  { id: "t2", title: "Sprint task B", status: "in_progress", priority: 3, project_id: "p1", updated_at: "2026-05-01T00:00:01Z", sprint_id: "sprint-1" },
  { id: "t3", title: "Non-sprint task", status: "pending", priority: 1, project_id: "p1", updated_at: "2026-05-01T00:00:02Z", sprint_id: null },
];

describe("/projects/[id]/sprint/[sprintId] +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as unknown as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders only sprint-scoped tasks; unsprinted tasks absent from DOM", () => {
    const { body } = render(Page, {
      props: { data: { project: { id: "p1", name: "Alpha" }, sprint: SPRINT, tasks: TASKS } },
    });

    expect(body).toContain("Sprint task A");
    expect(body).toContain("Sprint task B");
    expect(body).not.toContain("Non-sprint task");
  });

  test("sprint header shows goal text, date range, days remaining", () => {
    const { body } = render(Page, {
      props: { data: { project: { id: "p1", name: "Alpha" }, sprint: SPRINT, tasks: TASKS } },
    });

    expect(body).toContain("Ship active sprint board");
    expect(body).toContain("2026-05-01");
    expect(body).toContain("2026-05-14");
    expect(body).toMatch(/days?\s*(remaining|overdue|left)/i);
  });

  test("close sprint button rendered for active sprint", () => {
    const { body } = render(Page, {
      props: { data: { project: { id: "p1", name: "Alpha" }, sprint: SPRINT, tasks: [] } },
    });

    expect(body).toMatch(/close\s*sprint/i);
  });

  test("quick-add input rendered per column", () => {
    const { body } = render(Page, {
      props: { data: { project: { id: "p1", name: "Alpha" }, sprint: SPRINT, tasks: [] } },
    });

    expect(body).toMatch(/data-quick-add/);
  });
});
