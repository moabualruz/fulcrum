import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Component } from "svelte";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mediaQueryMock } from "$lib/test/media-query-mock";
import { modeWatcherMock } from "$lib/test/mode-watcher-mock";
import { useFormToastMock } from "$lib/test/use-form-toast-mock";

// `mock.module` is process-global; these two seams apply this suite's SSR-shell
// doubles only while the suite runs and otherwise fall through to the real
// implementations, so sibling unit suites importing the real modules pass.
let suiteActive = false;

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

mock.module("$lib/assets/favicon.svg", () => ({ default: "/favicon.svg" }));
mock.module("mode-watcher", () => modeWatcherMock());
mock.module("$lib/feedback/use-form-toast", () =>
  useFormToastMock(() => (suiteActive ? () => undefined : null)),
);
mock.module("$lib/components/app/AppSidebar.svelte", () => ({ default: () => "<aside aria-label=\"primary navigation\"></aside>" }));
mock.module("$lib/components/command-palette/CommandPalette.svelte", () => ({ default: () => "" }));
mock.module("$lib/util/media-query", () =>
  mediaQueryMock(() =>
    suiteActive
      ? { browserDriver: () => ({ matches: () => false }), isMobileViewport: () => false }
      : null,
  ),
);
mock.module("$lib/utils.js", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
mock.module("$lib/components/app/BellBadge.svelte", () => ({ default: () => "" }));
mock.module("@lucide/svelte/icons/bell", () => ({ default: () => "" }));
mock.module("@lucide/svelte/icons/sun", () => ({ default: () => "" }));

interface LayoutData {
  activeProjectId: string | null;
  i18n?: { enabled: boolean; locale: string; dir: "ltr" | "rtl" | null };
}

interface LayoutProps {
  data: LayoutData;
  children?: () => unknown;
}

describe("+layout.svelte SSR shell", () => {
  let render: typeof import("svelte/server").render;
  let Layout: Component<LayoutProps>;

  beforeAll(async () => {
    suiteActive = true;
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+layout.svelte")) as {
      default: Component<LayoutProps>;
    };
    Layout = mod.default;
  });

  afterAll(() => {
    suiteActive = false;
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

  test("renders exactly one theme-toggle control in the scope bar system cluster", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: null } },
    });
    // OD shell: the theme toggle moved into the ScopeBar system cluster as the
    // "display" segment, wired to mode-watcher's `toggleMode` via `onThemeToggle`.
    const displayIcon = body.match(/data-scope-system-icon="display"/g) ?? [];
    expect(displayIcon).toHaveLength(1);
    const themeLabel = body.match(/aria-label="Display, density, mode, theme"/g) ?? [];
    expect(themeLabel).toHaveLength(1);
  });

  test("workspace path falls back to all-projects when activeProjectId is null", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: null } },
    });
    // OD shell: the active project surfaces in the ScopeBar workspace path
    // (`data-slot="scope-bar-workspace"`); with no active project the path
    // resolves to the `all-projects` fallback.
    expect(body).toMatch(/<span[^>]*data-slot="scope-bar-workspace"[^>]*>[^<]*all-projects<\/span>/);
  });

  test("workspace path echoes the active project slug when provided", () => {
    const { body } = render(Layout, {
      props: { data: { activeProjectId: "fulcrum" } },
    });
    expect(body).toMatch(/<span[^>]*data-slot="scope-bar-workspace"[^>]*>[^<]*fulcrum<\/span>/);
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

  // OD shell redesign: the mobile hamburger `Sheet` was replaced by the
  // ui-kit `MobileStageTabs` primitive (commit "feat(web): add mobile stage
  // tabs"). The original regression guarded a hand-rolled bits-ui Sheet whose
  // Trigger had to share a Root context provider; that structure no longer
  // exists. The surviving intent — the mobile nav is the ui-kit primitive and
  // the shell carries no orphan hand-rolled Sheet overlay (AGENTS.md ui-kit
  // rule) — is asserted against the source instead.
  test("mobile nav uses the ui-kit MobileStageTabs primitive, no hand-rolled Sheet", () => {
    const layoutSrc = readFileSync(
      fileURLToPath(new URL("./+layout.svelte", import.meta.url)),
      "utf8",
    );
    expect(layoutSrc).toContain("<MobileStageTabs");
    // No route-local Sheet overlay survives the OD shell redesign.
    expect(layoutSrc).not.toContain("<Sheet.Root");
    expect(layoutSrc).not.toContain("<Sheet.Trigger");
  });

  test("layout renders without throwing for null activeProjectId", () => {
    expect(() =>
      render(Layout, { props: { data: { activeProjectId: null } } }),
    ).not.toThrow();
  });

  // OD shell redesign: the inline locale picker was removed from the global
  // shell — locale selection now lives on the dedicated `/settings/i18n`
  // route. The shell still receives `LayoutData.i18n` (enabled / locale /
  // dir) from `+layout.server.ts`; the surviving contract is that the shell
  // renders cleanly for any i18n config (RTL-enabled or disabled) and never
  // re-introduces a route-local locale-picker overlay.
  test("shell renders for any i18n config without a route-local locale picker", () => {
    const off = render(Layout, {
      props: { data: { activeProjectId: null, i18n: { enabled: false, locale: "en", dir: null } } },
    }).body;
    expect(off).not.toContain("data-locale-picker");

    const on = render(Layout, {
      props: { data: { activeProjectId: null, i18n: { enabled: true, locale: "ar", dir: "rtl" } } },
    }).body;
    expect(on).not.toContain("data-locale-picker");
    // Shell still renders its scope bar regardless of the i18n config.
    expect(on).toMatch(/<header\b[^>]*data-app-topbar/);
  });
});
