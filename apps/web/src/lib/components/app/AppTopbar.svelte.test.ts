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
  densityMode?: "default" | "advanced";
  bellCount?: number;
  bellItems?: Array<{ id: string; kind: string; title: string }>;
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

  test("root pathname renders only a 'Dashboard' breadcrumb page (no link)", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: null },
    });
    const pageMatches =
      body.match(
        /<span\b[^>]*data-slot="breadcrumb-page"[^>]*aria-current="page"[^>]*>Dashboard<\/span>/g,
      ) ?? [];
    expect(pageMatches).toHaveLength(1);
    // No link crumbs when at root.
    expect(body).not.toMatch(/data-slot="breadcrumb-link"/);
    // Active-project label shows the em dash placeholder.
    expect(body).toMatch(
      /<span[^>]*data-active-project[^>]*>—<\/span>/,
    );
  });

  test("/projects renders Dashboard link + separator + Projects page", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/projects", activeProjectId: null },
    });
    expect(body).toMatch(
      /<a\b[^>]*data-slot="breadcrumb-link"[^>]*href="\/"[^>]*>Dashboard<\/a>/,
    );
    expect(body).toMatch(/data-slot="breadcrumb-separator"/);
    expect(body).toMatch(
      /<span\b[^>]*data-slot="breadcrumb-page"[^>]*aria-current="page"[^>]*>Projects<\/span>/,
    );
  });

  test("/projects/fulcrum renders three crumbs (Dashboard link, Projects link, Fulcrum page)", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/projects/fulcrum", activeProjectId: "fulcrum" },
    });
    expect(body).toMatch(
      /<a\b[^>]*data-slot="breadcrumb-link"[^>]*href="\/"[^>]*>Dashboard<\/a>/,
    );
    expect(body).toMatch(
      /<a\b[^>]*data-slot="breadcrumb-link"[^>]*href="\/projects"[^>]*>Projects<\/a>/,
    );
    expect(body).toMatch(
      /<span\b[^>]*data-slot="breadcrumb-page"[^>]*aria-current="page"[^>]*>Fulcrum<\/span>/,
    );
    const linkMatches = body.match(/data-slot="breadcrumb-link"/g) ?? [];
    expect(linkMatches).toHaveLength(2);
    const pageMatches = body.match(/data-slot="breadcrumb-page"/g) ?? [];
    expect(pageMatches).toHaveLength(1);
  });

  test('theme toggle: exactly one element has aria-label="toggle theme" and data-theme-toggle', () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: null },
    });
    const ariaMatches =
      body.match(/aria-label="toggle theme"/g) ?? [];
    expect(ariaMatches).toHaveLength(1);
    const hookMatches = body.match(/data-theme-toggle/g) ?? [];
    expect(hookMatches).toHaveLength(1);
  });

  test('cmd+K hint: <kbd aria-label="open command palette">⌘K</kbd>', () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: null },
    });
    expect(body).toMatch(
      /<kbd\b[^>]*aria-label="open command palette"[^>]*>⌘K<\/kbd>/,
    );
  });

  test("active project label reflects activeProjectId prop", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/", activeProjectId: "fulcrum" },
    });
    expect(body).toMatch(
      /<span[^>]*data-active-project[^>]*>fulcrum<\/span>/,
    );
  });

  test("renders scope indicator and density mode switch without changing permissions", () => {
    const { body } = render(AppTopbar, {
      props: { pathname: "/projects/fulcrum/board", activeProjectId: "fulcrum", densityMode: "advanced" },
    });
    expect(body).toMatch(/data-scope-indicator/);
    expect(body).toContain("fulcrum");
    expect(body).toMatch(/data-density-switch/);
    expect(body).toMatch(/data-density-mode="advanced"/);
    expect(body).toMatch(/aria-label="default density"/);
    expect(body).toMatch(/aria-label="advanced density"/);
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
    expect(body).toMatch(/<span\b[^>]*data-notification-badge[^>]*>3<\/span>/);
    expect(body).toContain("Task assigned");
    expect(body).toContain("Doc mentioned");
    expect(body).toMatch(/<a\b[^>]*href="\/inbox"[^>]*>See all<\/a>/);
  });
});
