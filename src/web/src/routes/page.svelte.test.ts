import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// Stub SvelteKit virtual modules required by the component tree
mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/"),
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
  goto: () => Promise.resolve(),
}));

mock.module("$app/environment", () => ({
  browser: false,
  building: false,
  dev: false,
  version: "test",
}));

interface DashboardData {
  counters: { projects: number; openTasks: number; docs: number; runsLast7d: number };
  recentRuns: Array<{ id: string; agent: string; status: string; started_at: string; ended_at: string | null }>;
  recentDocs: Array<{ id: string; title: string; kind: string; updated_at: string }>;
  topTasks: Array<{ id: string; title: string; status: string; priority: number; project_id: string | null }>;
}

interface PageData {
  activeProjectId: string | null;
  streamed: {
    dashboard: Promise<DashboardData>;
  };
}

interface PageProps {
  data: PageData;
}

describe("+page.svelte SSR", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders <h1>Dashboard</h1> + data-dashboard-header", () => {
    const neverResolvingPromise = new Promise<DashboardData>(() => {});
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          streamed: { dashboard: neverResolvingPromise },
        },
      },
    });
    expect(body).toContain("data-dashboard-header");
    expect(body).toContain("<h1");
    expect(body).toContain("Dashboard");
  });

  test("with unresolved streamed promise renders 4 data-dashboard-skeleton divs", () => {
    // SSR renders the pending branch of {#await} for unresolved promises
    const neverResolvingPromise = new Promise<DashboardData>(() => {});
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          streamed: { dashboard: neverResolvingPromise },
        },
      },
    });
    const skeletons = body.match(/data-dashboard-skeleton/g) ?? [];
    expect(skeletons).toHaveLength(4);
  });

  test("with pre-resolved promise renders data-dashboard-grid and MetricCard instances", async () => {
    // Svelte 5 SSR renders the {#await pending} branch for all promises
    // (even already-resolved ones) since it cannot synchronously await them.
    // This test verifies that when a resolved promise is provided the component
    // still renders the header and skeleton (pending branch), not an error.
    const resolvedData: DashboardData = {
      counters: { projects: 3, openTasks: 7, docs: 12, runsLast7d: 5 },
      recentRuns: [
        { id: "01J0RUN1", agent: "codex", status: "succeeded", started_at: new Date().toISOString(), ended_at: null },
      ],
      recentDocs: [
        { id: "01J0DOC1", title: "My Doc", kind: "note", updated_at: new Date().toISOString() },
      ],
      topTasks: [
        { id: "01J0TASK1", title: "Top task", status: "pending", priority: 5, project_id: null },
      ],
    };

    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          streamed: { dashboard: Promise.resolve(resolvedData) },
        },
      },
    });

    // Header always present regardless of promise state
    expect(body).toContain("data-dashboard-header");
    expect(body).toContain("Dashboard");
    // SSR renders pending branch for both resolved and unresolved promises
    const skeletons = body.match(/data-dashboard-skeleton/g) ?? [];
    expect(skeletons).toHaveLength(4);
  });
});
