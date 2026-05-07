import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
mock.module("mode-watcher", () => ({
  ModeWatcher: () => "",
  toggleMode: () => undefined,
}));
mock.module("$lib/feedback/use-form-toast", () => ({ toastFromForm: () => undefined }));
mock.module("$lib/components/app/AppSidebar.svelte", () => ({ default: () => "<aside aria-label=\"primary navigation\"></aside>" }));
mock.module("$lib/components/command-palette/CommandPalette.svelte", () => ({ default: () => "" }));
mock.module("$lib/components/ui/sheet", () => ({
  Root: () => "",
  Content: () => "",
  Trigger: () => "",
}));
mock.module("$lib/components/ui/button", () => ({ buttonVariants: () => "" }));
mock.module("$lib/util/media-query", () => ({
  MOBILE_QUERY: "(max-width: 767px)",
  browserDriver: () => ({}),
  isMobileViewport: () => false,
}));
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

  // Regression for Codex review of f751603: bits-ui requires Sheet.Trigger
  // to share the same Sheet.Root context provider as Sheet.Content; a trigger
  // rendered as a sibling of <Sheet.Root> throws "Context Dialog.Root |
  // AlertDialog.Root not found" the moment it tries to mount on mobile.
  // SSR hits the desktop branch (mobile=false), so the throw is unreachable
  // here — assert the structural shape of the source instead.
  test("Sheet.Trigger lives inside the same Sheet.Root as Sheet.Content", () => {
    const layoutSrc = readFileSync(
      fileURLToPath(new URL("./+layout.svelte", import.meta.url)),
      "utf8",
    );
    const rootOpen = layoutSrc.indexOf("<Sheet.Root");
    const rootClose = layoutSrc.indexOf("</Sheet.Root>");
    expect(rootOpen).toBeGreaterThan(-1);
    expect(rootClose).toBeGreaterThan(rootOpen);
    const inside = layoutSrc.slice(rootOpen, rootClose);
    expect(inside).toContain("<Sheet.Trigger");
    expect(inside).toContain("<Sheet.Content");
    // Exactly one Sheet.Root wrapping the mobile branch.
    const rootOpens = layoutSrc.match(/<Sheet\.Root\b/g) ?? [];
    expect(rootOpens).toHaveLength(1);
  });

  test("layout renders without throwing for null activeProjectId", () => {
    expect(() =>
      render(Layout, { props: { data: { activeProjectId: null } } }),
    ).not.toThrow();
  });

  test("renders locale picker only when i18n flag is enabled", () => {
    const off = render(Layout, {
      props: { data: { activeProjectId: null, i18n: { enabled: false, locale: "en", dir: null } } },
    }).body;
    expect(off).not.toContain("data-locale-picker");

    const on = render(Layout, {
      props: { data: { activeProjectId: null, i18n: { enabled: true, locale: "ar", dir: "rtl" } } },
    }).body;
    expect(on).toContain("data-locale-picker");
    expect(on).toContain('name="locale"');
    expect(on).toContain('value="ar"');
  });
});
