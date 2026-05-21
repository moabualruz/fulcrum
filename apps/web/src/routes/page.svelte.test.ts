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

// `mock.module` registrations are process-global and the export-name set is
// frozen on first registration — an incomplete stub here would strip
// `invalidateAll` from every later test that imports the real module. Mirror
// the real `$app/navigation` surface the component tree relies on.
mock.module("$app/navigation", () => ({
  goto: () => Promise.resolve(),
  invalidate: () => Promise.resolve(),
  invalidateAll: () => Promise.resolve(),
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
  projectTiles: Array<{ id: string; name: string; openTasks: number; lastActivity: string | null }>;
  unreadCount: number;
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

/**
 * Root `/` renders the portfolio Dashboard PortfolioSurface
 * (`prd-web-root-default-screen`). The metric-dashboard root —
 * `<h1>Dashboard</h1>` over four zero-value MetricCards
 * (`00-executive-review.md` failure 5) — is retired. With an active project
 * the server `load` redirects to the Capture stage workbench instead, so this
 * surface only ever renders for the no-project case.
 */
describe("+page.svelte SSR — portfolio Dashboard", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  function renderWith(dashboard: Promise<DashboardData>): string {
    return render(Page, {
      props: { data: { activeProjectId: null, streamed: { dashboard } } },
    }).body;
  }

  test("renders the portfolio Dashboard PortfolioSurface, not a metric dashboard", () => {
    const body = renderWith(new Promise<DashboardData>(() => {}));
    // The portfolio surface carries the portfolio scope markers.
    expect(body).toContain('data-route="portfolio-dashboard"');
    expect(body).toContain('data-shell-scope="portfolio"');
    expect(body).toContain("portfolio-hero");
  });

  test("no longer renders the retired <h1>Dashboard</h1> metric grid", () => {
    const body = renderWith(new Promise<DashboardData>(() => {}));
    // Copy assertion: the retired primary heading + zero-metric grid are gone.
    expect(body).not.toContain(">Dashboard<");
    expect(body).not.toContain("data-dashboard-header");
    expect(body).not.toContain("data-dashboard-skeleton");
    // The portfolio surface's heading is "Portfolio".
    expect(body).toContain(">Portfolio<");
  });

  test("the pending branch is the route skeleton, never the four-card metric grid", () => {
    const body = renderWith(new Promise<DashboardData>(() => {}));
    // SSR renders the {#await} pending branch — the route-level skeleton —
    // and never the retired four zero-metric MetricCard grid.
    expect(body).toContain("portfolio-dashboard");
    expect(body).not.toContain("data-metric-card");
  });
});
