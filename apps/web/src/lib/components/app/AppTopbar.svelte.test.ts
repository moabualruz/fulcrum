import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` harness needs server-compiled `.svelte` modules
// (see svelte-ssr-preload.ts). `$app/state` is a SvelteKit virtual; the live
// layout owner passes `pathname` explicitly so this stub only exists to keep
// any transitive imports happy.
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

type AppTopbarProps = {
  pathname: string;
  activeProjectId: string | null;
  densityMode?: "compact" | "cozy" | "comfortable";
  bellCount?: number;
  bellItems?: Array<{ id: string; kind: string; title: string }>;
  traceId?: string | null;
};

describe("AppTopbar component", () => {
  let render: typeof import("svelte/server").render;
  let AppTopbar: Component<AppTopbarProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./AppTopbar.svelte")) as {
      default: Component<AppTopbarProps>;
    };
    AppTopbar = mod.default;
  });

  test("renders one <header data-app-topbar>", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: null },
    });
    const matches = body.match(/<header\b[^>]*data-app-topbar/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  test("root pathname renders the OD ScopeBar, not breadcrumb chrome", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: null, traceId: "4f3a1c9e2b7d8a6c" },
    });
    expect(body).toMatch(/data-slot="scope-bar"/);
    expect(body).toMatch(/data-scope-bar/);
    expect(body).toContain("Fulcrum");
    expect(body).not.toMatch(/data-slot="breadcrumb-link"/);
    expect(body).not.toMatch(/data-slot="breadcrumb-page"/);
    expect(body).toMatch(/data-slot="trace-chip"/);
    expect(body).toContain("trace:");
  });

  test("stage tabs mirror the six workflow stages and preserve active stage", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/projects/fulcrum/build", activeProjectId: "fulcrum" },
    });
    const tabs = body.match(/data-slot="scope-bar-tab"/g) ?? [];
    expect(tabs).toHaveLength(6);
    for (const label of ["Capture", "Plan", "Build", "Review", "Ship", "Operate"]) {
      expect(body).toContain(label);
    }
    expect(body).toMatch(/data-active-stage="build"/);
    expect(body).toMatch(/data-stage="build"[^>]*data-active="true"/);
  });

  test("right system cluster exposes canonical tooltips and aria-expanded state", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: null, bellCount: 3 },
    });
    for (const label of [
      "Command palette · ⌘K",
      "Notifications · 3 unread",
      "Display, density, mode, theme",
      "Keyboard shortcuts · ?",
      "Account · sign out, switch workspace",
    ]) {
      expect(body).toContain(`aria-label="${label}"`);
    }
    const expanded = body.match(/aria-expanded="false"/g) ?? [];
    expect(expanded.length).toBeGreaterThanOrEqual(5);
  });

  test("active project label reflects activeProjectId prop", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: "fulcrum" },
    });
    expect(body).toContain("mkh / fulcrum");
  });

  test("renders canonical density terms", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/projects/fulcrum/board", activeProjectId: "fulcrum", densityMode: "comfortable" },
    });
    expect(body).toMatch(/data-density-switch/);
    expect(body).toMatch(/data-density-mode="comfortable"/);
    expect(body).toContain("Compact");
    expect(body).toContain("Cozy");
    expect(body).toContain("Comfortable");
    expect(body).not.toContain("Default");
    expect(body).not.toContain("Advanced");
  });

  test("bell badge renders count, top-five unread items, and See all inbox link", () => {
    const { body } = render(AppTopbar, {
      props: {
        pathname: "/projects",
        activeProjectId: null,
        bellCount: 3,
        bellItems: [
          { id: "n-1", kind: "task", title: "Task assigned" },
          { id: "n-2", kind: "doc", title: "Doc mentioned" },
        ],
      },
    });

    expect(body).toMatch(/<button\b[^>]*data-notification-bell/);
    expect(body).toMatch(/<button\b[^>]*data-notification-bell[^>]*aria-expanded="false"/);
    expect(body).toMatch(/<span\b[^>]*data-notification-badge[^>]*>3<\/span>/);
    expect(body).toContain("Task assigned");
    expect(body).toContain("Doc mentioned");
    expect(body).toMatch(/<a\b[^>]*href="\/inbox"[^>]*>See all<\/a>/);
  });
});
