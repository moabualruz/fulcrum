/**
 * TDD — i18n screen gating.
 * RED written first; GREEN by apps/tui/src/screens/i18n-screen.ts.
 *
 * Acceptance criteria covered:
 *  - i18n OFF → screen hidden, "Feature disabled" banner
 *  - i18n OFF → Settings navigator tab hidden
 *  - i18n ON  → locale list rendered
 *  - i18n ON  → selecting "fr" stored via SettingsService
 *  - i18n ON  → TUI labels switch to French (3 translated strings)
 *  - CLI `fulcrum flags set i18n on/off` toggling (env-variable level)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
  renderI18nScreen,
  selectLocale,
  i18nTabVisible,
  SETTINGS_KEY_LOCALE,
} from "@fulcrum/tui/screens/i18n-screen.ts";
import { resetFeaturesCache } from "../../src/flags/index.ts";

// Minimal in-memory SettingsService for tests.
function makeSettings(initial: Record<string, string> = {}): {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  store: Record<string, string>;
} {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    async get(key: string) {
      return store[key] ?? null;
    },
    async set(key: string, value: string) {
      store[key] = value;
    },
  };
}

beforeEach(() => {
  resetFeaturesCache();
});

describe("i18n screen — flag OFF", () => {
  const env = { FULCRUM_FEATURES: "" };

  test("renderI18nScreen returns visible=false", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.visible).toBe(false);
  });

  test("renderI18nScreen returns 'Feature disabled' banner", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.banner).toBe("Feature disabled");
  });

  test("renderI18nScreen does not expose locales list", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.locales).toBeUndefined();
  });

  test("i18nTabVisible returns false when flag OFF", () => {
    expect(i18nTabVisible(env)).toBe(false);
  });

  test("selectLocale throws 'Feature disabled' when flag OFF", async () => {
    const settings = makeSettings();
    await expect(selectLocale("fr", { settings, env })).rejects.toThrow(
      "Feature disabled",
    );
  });
});

describe("i18n screen — flag ON", () => {
  const env = { FULCRUM_FEATURES: "i18n" };

  test("renderI18nScreen returns visible=true", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.visible).toBe(true);
  });

  test("renderI18nScreen returns a non-empty locales list", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.locales).toBeDefined();
    expect((result.locales ?? []).length).toBeGreaterThan(0);
  });

  test("renderI18nScreen includes 'fr' in locales list", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.locales).toContain("fr");
  });

  test("renderI18nScreen includes en, fr, and ar in locales list", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.locales).toContain("en");
    expect(result.locales).toContain("fr");
    expect(result.locales).toContain("ar");
  });

  test("i18nTabVisible returns true when flag ON", () => {
    expect(i18nTabVisible(env)).toBe(true);
  });

  test("selectLocale stores locale in SettingsService", async () => {
    const settings = makeSettings();
    await selectLocale("fr", { settings, env });
    expect(settings.store[SETTINGS_KEY_LOCALE]).toBe("fr");
  });

  test("selectLocale returns labels in French (settings.title)", async () => {
    const settings = makeSettings();
    const { labels } = await selectLocale("fr", { settings, env });
    expect(labels["settings.title"]).toBe("Paramètres");
  });

  test("selectLocale returns labels in French (search.placeholder)", async () => {
    const settings = makeSettings();
    const { labels } = await selectLocale("fr", { settings, env });
    expect(labels["search.placeholder"]).toBe("Rechercher…");
  });

  test("selectLocale returns labels in French (nav.projects)", async () => {
    const settings = makeSettings();
    const { labels } = await selectLocale("fr", { settings, env });
    expect(labels["nav.projects"]).toBe("Projets");
  });

  test("renderI18nScreen currentLocale defaults to 'en'", async () => {
    const settings = makeSettings();
    const result = await renderI18nScreen({ settings, env });
    expect(result.currentLocale).toBe("en");
  });

  test("renderI18nScreen currentLocale reflects stored locale", async () => {
    const settings = makeSettings({ [SETTINGS_KEY_LOCALE]: "de" });
    const result = await renderI18nScreen({ settings, env });
    expect(result.currentLocale).toBe("de");
  });
});

describe("i18n flag via CLI env simulation", () => {
  test("flag OFF → tab hidden (simulates fulcrum flags set i18n off)", () => {
    const env = { FULCRUM_FEATURES: "" };
    expect(i18nTabVisible(env)).toBe(false);
  });

  test("flag ON → tab visible (simulates fulcrum flags set i18n on)", () => {
    const env = { FULCRUM_FEATURES: "i18n" };
    expect(i18nTabVisible(env)).toBe(true);
  });

  test("multiple flags — i18n on, embeddings on → i18n tab visible", () => {
    const env = { FULCRUM_FEATURES: "i18n,embeddings" };
    expect(i18nTabVisible(env)).toBe(true);
  });

  test("multiple flags — only embeddings on → i18n tab hidden", () => {
    const env = { FULCRUM_FEATURES: "embeddings" };
    expect(i18nTabVisible(env)).toBe(false);
  });
});
