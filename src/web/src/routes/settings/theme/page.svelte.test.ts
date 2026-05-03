import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { THEME_DEFAULTS, PRESETS } from "./+page.server.ts";
import type { ThemeSettings } from "./+page.server.ts";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/settings/theme"),
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
  goto: async () => {},
  invalidateAll: async () => {},
}));

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));

mock.module("$app/environment", () => ({
  browser: false,
  dev: false,
  building: false,
  version: "",
}));

type PageProps = {
  data: { settings: ThemeSettings };
  form?: Record<string, unknown>;
};

describe("/settings/theme +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders h1 'Theme'", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toMatch(/<h1\b[^>]*>Theme<\/h1>/);
  });

  test("renders preset buttons for all presets", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    for (const preset of Object.keys(PRESETS)) {
      expect(body).toContain(`data-preset="${preset}"`);
    }
  });

  test("renders accent hue slider", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-accent-hue");
  });

  test("renders accent saturation slider", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-accent-saturation");
  });

  test("renders accent lightness slider", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-accent-lightness");
  });

  test("renders radius slider", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-radius-slider");
  });

  test("renders font family select", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-font-family");
  });

  test("renders color scheme radio buttons", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    for (const scheme of ["light", "dark", "auto"]) {
      expect(body).toContain(`data-color-scheme="${scheme}"`);
    }
  });

  test("renders compact mode toggle", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-compact-mode");
  });

  test("renders animation speed options", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    for (const speed of ["normal", "reduced", "off"]) {
      expect(body).toContain(`data-animation-speed="${speed}"`);
    }
  });

  test("renders save button", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-save-theme");
  });

  test("renders reset button pointing to ?/reset", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-reset-theme");
    expect(body).toContain("?/reset");
  });

  test("renders live preview panel", () => {
    const { body } = render(Page, { props: { data: { settings: THEME_DEFAULTS } } });
    expect(body).toContain("data-theme-preview");
    expect(body).toContain("data-preview-accent-swatch");
    expect(body).toContain("data-preview-button");
  });

  test("shows save error from form", () => {
    const { body } = render(Page, {
      props: { data: { settings: THEME_DEFAULTS }, form: { saveError: "Theme service unavailable" } },
    });
    expect(body).toContain("data-save-error");
    expect(body).toContain("Theme service unavailable");
  });

  test("shows save success from form", () => {
    const { body } = render(Page, {
      props: { data: { settings: THEME_DEFAULTS }, form: { saved: true } },
    });
    expect(body).toContain("data-save-success");
    expect(body).toContain("Theme saved");
  });

  test("active preset has aria-pressed=true", () => {
    const { body } = render(Page, {
      props: { data: { settings: { ...THEME_DEFAULTS, preset: "ocean" } } },
    });
    expect(body).toContain('data-preset="ocean" aria-pressed="true"');
  });

  test("preview style includes HSL vars from settings", () => {
    const custom: ThemeSettings = { ...THEME_DEFAULTS, accentHue: 120, accentSaturation: 50, accentLightness: 40 };
    const { body } = render(Page, { props: { data: { settings: custom } } });
    // Swatch uses the individual values
    expect(body).toContain("hsl(120");
  });
});
