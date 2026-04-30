import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` harness needs server-compiled `.svelte` modules
// (loaded via root `bunfig.toml [test] preload`). Stub virtual modules used
// by the layout / its descendants.
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

mock.module("$lib/assets/favicon.svg", () => ({ default: "/favicon.svg" }));

interface LayoutData {
  activeProjectId: string | null;
}

interface LayoutProps {
  data: LayoutData;
  children?: () => unknown;
}

describe("+layout.svelte SSR shell", () => {
  let render: typeof import("svelte/server").render;
  let Layout: Component<LayoutProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+layout.svelte")) as {
      default: Component<LayoutProps>;
    };
    Layout = mod.default;
  });

  test("renders exactly one <header data-app-topbar>", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: null } },
    });
    const matches = body.match(/<header\b[^>]*data-app-topbar/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  test("renders at least one <aside aria-label=\"primary navigation\">", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: null } },
    });
    const matches =
      body.match(/<aside\b[^>]*aria-label="primary navigation"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test("renders exactly one theme-toggle button", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: null } },
    });
    const aria = body.match(/aria-label="toggle theme"/g) ?? [];
    expect(aria).toHaveLength(1);
    const hook = body.match(/data-theme-toggle/g) ?? [];
    expect(hook).toHaveLength(1);
  });

  test("active-project label says em dash when activeProjectId is null", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: null } },
    });
    expect(body).toMatch(/<span[^>]*data-active-project[^>]*>—<\/span>/);
  });

  test("active-project label echoes the slug when provided", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: "fulcrum" } },
    });
    expect(body).toMatch(/<span[^>]*data-active-project[^>]*>fulcrum<\/span>/);
  });

  test("mounts a svelte-sonner Toaster (section with aria-live=polite)", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: null } },
    });
    // svelte-sonner always renders a <section aria-live="polite"> wrapper;
    // the inner <ol data-sonner-toaster> only mounts once a toast fires.
    const sonner =
      /<section\b[^>]*aria-live="polite"/.test(body) ||
      /data-sonner-toaster/.test(body);
    expect(sonner).toBe(true);
  });
});
