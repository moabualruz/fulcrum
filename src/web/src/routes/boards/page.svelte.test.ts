import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` needs server-compiled `.svelte` modules — Bun's
// `.svelte` loader is registered globally via `bunfig.toml` `[test] preload`.

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/boards"),
    params: {},
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
}

type PageProps = {
  data: { tasks: BoardTask[]; project: string };
};

const SAMPLE: BoardTask[] = [
  {
    id: "01J0TASK0000000000000000PE1",
    title: "Pending one",
    status: "pending",
    priority: 0,
    project_id: "alpha",
    updated_at: "2026-04-30T01:00:00.000Z",
  },
  {
    id: "01J0TASK0000000000000000PE2",
    title: "Pending two",
    status: "pending",
    priority: 0,
    project_id: "beta",
    updated_at: "2026-04-29T01:00:00.000Z",
  },
  {
    id: "01J0TASK0000000000000000IP1",
    title: "In progress one",
    status: "in_progress",
    priority: 1,
    project_id: "alpha",
    updated_at: "2026-04-29T02:00:00.000Z",
  },
  {
    id: "01J0TASK0000000000000000BL1",
    title: "Blocked one",
    status: "blocked",
    priority: 0,
    project_id: null,
    updated_at: "2026-04-28T01:00:00.000Z",
  },
  {
    id: "01J0TASK0000000000000000DN1",
    title: "Completed one",
    status: "completed",
    priority: 0,
    project_id: "alpha",
    updated_at: "2026-04-27T01:00:00.000Z",
  },
];

describe("/boards +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders five board columns regardless of seeded task distribution", () => {
    const { body } = render(Page, {
      props: { data: { tasks: SAMPLE, project: "" } },
    });
    const cols = body.match(/data-board-column[^-]/g) ?? [];
    expect(cols.length).toBeGreaterThanOrEqual(5);
    // Each canonical status surface must appear via `data-status="<status>"`.
    for (const status of ["pending", "in_progress", "blocked", "completed", "cancelled"]) {
      expect(body).toContain(`data-status="${status}"`);
    }
  });

  test("each column count badge matches the seeded distribution", () => {
    const { body } = render(Page, {
      props: { data: { tasks: SAMPLE, project: "" } },
    });
    function countFor(status: string): number {
      const colStart = body.indexOf(`data-status="${status}"`);
      if (colStart === -1) return -1;
      const slice = body.slice(colStart, colStart + 4000);
      const match = slice.match(/data-board-column-count[^>]*>(\d+)</);
      return match ? Number(match[1]) : -1;
    }
    expect(countFor("pending")).toBe(2);
    expect(countFor("in_progress")).toBe(1);
    expect(countFor("blocked")).toBe(1);
    expect(countFor("completed")).toBe(1);
    expect(countFor("cancelled")).toBe(0);
  });

  test("project filter select renders distinct project ids plus an All option", () => {
    const { body } = render(Page, {
      props: { data: { tasks: SAMPLE, project: "" } },
    });
    expect(body).toContain("data-board-project-filter");
    // Distinct non-null projects in SAMPLE: alpha, beta.
    const filterStart = body.indexOf("data-board-project-filter");
    const filterSlice = body.slice(filterStart, filterStart + 4000);
    expect(filterSlice).toMatch(/<option[^>]*value=""[^>]*>\s*All\s*<\/option>/);
    expect(filterSlice).toContain('value="alpha"');
    expect(filterSlice).toContain('value="beta"');
  });

  test("page header h1 reads 'Board'", () => {
    const { body } = render(Page, {
      props: { data: { tasks: [], project: "" } },
    });
    expect(body).toMatch(/<h1\b[^>]*>\s*Board\s*<\/h1>/);
  });
});
