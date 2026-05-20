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

  test("mounts the @fulcrum/ui-kit StageRail primitive", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    expect(body).toContain('data-slot="stage-rail"');
    expect(body).toContain('data-collapsed="false"');
  });

  test("does NOT render the six-stage workflow axis as rail items", () => {
    // Axis ownership (`prd-web-shell-stage-axis-ownership-fix`): the six-stage
    // Capture→Operate axis belongs to the ScopeBar tab strip — the rail must
    // render zero six-stage list items.
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    const stageItems = body.match(/data-slot="stage-rail-item"/g) ?? [];
    expect(stageItems).toHaveLength(0);
    expect(body).not.toContain('data-slot="stage-rail-label"');
  });

  test("renders the active stage's sub-navigation as the rail's primary group", () => {
    // Root `/` resolves to the Capture stage; the rail shows Capture's sub-nav.
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    expect(body).toContain('data-slot="stage-rail-substage-group"');
    expect(body).toContain('data-stage="capture"');
    const substageItems = body.match(/data-slot="stage-rail-substage-item"/g) ?? [];
    expect(substageItems.length).toBeGreaterThan(0);
    // Capture's sub-nav per nav-data: Inbox · Docs.
    for (const label of ["Inbox", "Docs"]) {
      expect(body).toContain(label);
    }
  });

  test("keeps the rail synced to the active stage via data-current", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    // data-current is the route→stage mapping kept as data for the ScopeBar.
    expect(body).toContain('data-current="capture"');
  });

  test("supplies the persistent Workspace group with the preserved portfolio links", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    expect(body).toContain('data-slot="stage-rail-workspace-group"');
    for (const label of ["All projects", "Search", "Memory", "Context"]) {
      expect(body).toContain(label);
    }
  });

  test("supplies the System group with Settings · Knowledge · MCP · Plugins", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    const systemItems = body.match(/data-slot="stage-rail-system-item"/g) ?? [];
    expect(systemItems).toHaveLength(4);
    for (const label of ["Settings", "Knowledge", "MCP", "Plugins"]) {
      expect(body).toContain(label);
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
