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

  test("renders the six WorkflowStages with canonical labels", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    const stageItems = body.match(/data-slot="stage-rail-item"/g) ?? [];
    expect(stageItems).toHaveLength(6);
    for (const label of ["Capture", "Plan", "Build", "Review", "Ship", "Operate"]) {
      expect(body).toContain(label);
    }
  });

  test("marks the Capture stage active for the workspace root", () => {
    const { body } = render(AppSidebar, {
      props: { activeProjectId: null },
    });
    expect(body).toContain('data-current="capture"');
    expect(body).toMatch(/data-stage="capture"[^>]*data-active="true"|data-active="true"[^>]*data-stage="capture"/);
  });

  test("supplies the Workspace group with the preserved portfolio links", () => {
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
