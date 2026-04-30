import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// The `svelte/server` `render()` harness needs server-compiled `.svelte`
// modules. Bun's `.svelte` loader is registered globally via
// `bunfig.toml`'s `[test] preload` (`svelte-ssr-preload.ts`) so it wins
// the `onLoad({ filter: /\.svelte$/ })` race against any client-mode
// loader installed by sibling test files.

// `$app/state` is a SvelteKit virtual module; supply a lightweight stub so
// `page.url.pathname` reads work in this isolated render harness.
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

type AppSidebarProps = { activeProjectId: string | null };

describe("AppSidebar component", () => {
  let render: typeof import("svelte/server").render;
  let AppSidebar: Component<AppSidebarProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./AppSidebar.svelte")) as {
      default: Component<AppSidebarProps>;
    };
    AppSidebar = mod.default;
  });

  test("renders one <aside aria-label=\"primary navigation\">", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    const matches = body.match(/<aside\b[^>]*aria-label="primary navigation"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  test("emits a link for each NAV_ITEMS entry with the correct href", async () => {
    const { NAV_ITEMS } = await import("./nav-items.ts");
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    for (const item of NAV_ITEMS) {
      const re = new RegExp(`<a\\b[^>]*href="${item.href.replace(/\//g, "\\/")}"`);
      expect(body).toMatch(re);
      // Label visible in the rendered output.
      expect(body).toContain(item.label);
    }
  });

  test("placeholder shows '—' when activeProjectId is null", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    expect(body).toContain("—");
  });

  test("placeholder shows the slug when activeProjectId is provided", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: "fulcrum" },
    });
    expect(body).toContain("fulcrum");
  });
});
