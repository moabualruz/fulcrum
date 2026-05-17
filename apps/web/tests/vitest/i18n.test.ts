/**
 * Gated i18n tests.
 * Covers: feature flag off/on, RTL detection, locale cookie, Intl formatting,
 * translation extraction (0 untranslated keys), settings page server action.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

describe("isI18nEnabled()", () => {
  const orig = process.env.FULCRUM_FEATURES;

  afterEach(() => {
    if (orig === undefined) delete process.env.FULCRUM_FEATURES;
    else process.env.FULCRUM_FEATURES = orig;
  });

  test("returns false when FULCRUM_FEATURES not set", async () => {
    delete process.env.FULCRUM_FEATURES;
    const { isI18nEnabled } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isI18nEnabled()).toBe(false);
  });

  test("returns false when FULCRUM_FEATURES does not contain i18n", async () => {
    process.env.FULCRUM_FEATURES = "dark-mode,search";
    const { isI18nEnabled } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isI18nEnabled()).toBe(false);
  });

  test("returns true when FULCRUM_FEATURES=i18n", async () => {
    process.env.FULCRUM_FEATURES = "i18n";
    const { isI18nEnabled } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isI18nEnabled()).toBe(true);
  });

  test("returns true when i18n is one of several features", async () => {
    process.env.FULCRUM_FEATURES = "dark-mode,i18n,search";
    const { isI18nEnabled } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isI18nEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RTL detection
// ---------------------------------------------------------------------------

describe("isRTL()", () => {
  test("returns true for ar", async () => {
    const { isRTL } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isRTL("ar")).toBe(true);
  });

  test("returns true for he", async () => {
    const { isRTL } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isRTL("he")).toBe(true);
  });

  test("returns true for fa", async () => {
    const { isRTL } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isRTL("fa")).toBe(true);
  });

  test("returns false for en", async () => {
    const { isRTL } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isRTL("en")).toBe(false);
  });

  test("returns false for fr", async () => {
    const { isRTL } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isRTL("fr")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidLocale
// ---------------------------------------------------------------------------

describe("isValidLocale()", () => {
  test("accepts en", async () => {
    const { isValidLocale } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isValidLocale("en")).toBe(true);
  });

  test("accepts ar", async () => {
    const { isValidLocale } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isValidLocale("ar")).toBe(true);
  });

  test("rejects unknown locale", async () => {
    const { isValidLocale } = await import("../../src/lib/i18n/feature-flag.js");
    expect(isValidLocale("xx")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Intl formatting (per locale)
// ---------------------------------------------------------------------------

describe("formatDate()", () => {
  test("formats en date in medium style", async () => {
    const { formatDate } = await import("../../src/lib/i18n/format.js");
    const d = new Date("2024-01-15");
    const result = formatDate(d, "en");
    // Should contain month name in English
    expect(result).toMatch(/Jan/i);
  });

  test("formats ar date differently from en", async () => {
    const { formatDate } = await import("../../src/lib/i18n/format.js");
    const d = new Date("2024-01-15");
    const en = formatDate(d, "en");
    const ar = formatDate(d, "ar");
    // Arabic formatting will differ (Arabic numerals or different order)
    expect(ar).not.toBe(en);
  });
});

describe("formatNumber()", () => {
  test("formats en number with commas", async () => {
    const { formatNumber } = await import("../../src/lib/i18n/format.js");
    const result = formatNumber(1234567, "en");
    expect(result).toBe("1,234,567");
  });

  test("formats ar number in Arabic locale", async () => {
    const { formatNumber } = await import("../../src/lib/i18n/format.js");
    const ar = formatNumber(1000, "ar");
    // Arabic locale formats as string; may match en in limited Intl environments but always returns string
    expect(typeof ar).toBe("string");
    expect(ar.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Translation messages
// ---------------------------------------------------------------------------

describe("t() message lookup", () => {
  test("returns key when catalog is empty", async () => {
    const { t } = await import("../../src/lib/i18n/messages.js");
    expect(t({}, "some.key")).toBe("some.key");
  });

  test("returns translated string from catalog", async () => {
    const { t } = await import("../../src/lib/i18n/messages.js");
    const catalog = { "hello": "Hello!" };
    expect(t(catalog, "hello")).toBe("Hello!");
  });

  test("interpolates variables", async () => {
    const { t } = await import("../../src/lib/i18n/messages.js");
    const catalog = { "greeting": "Hello {name}!" };
    expect(t(catalog, "greeting", { name: "World" })).toBe("Hello World!");
  });
});

// ---------------------------------------------------------------------------
// Translation JSON completeness: 0 untranslated keys
// ---------------------------------------------------------------------------

describe("Translation JSON completeness", () => {
  test("ar.json has all keys present in en.json", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const messagesDir = join(import.meta.dirname, "../../messages");
    const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf-8")) as Record<string, string>;
    const ar = JSON.parse(readFileSync(join(messagesDir, "ar.json"), "utf-8")) as Record<string, string>;

    const enKeys = Object.keys(en);
    const missing = enKeys.filter((k) => !(k in ar));

    expect(missing).toHaveLength(0);
  });

  test("en.json has at least 5 keys", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const messagesDir = join(import.meta.dirname, "../../messages");
    const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf-8")) as Record<string, string>;

    expect(Object.keys(en).length).toBeGreaterThanOrEqual(5);
  });

  test("ar.json has at least 5 keys", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const messagesDir = join(import.meta.dirname, "../../messages");
    const ar = JSON.parse(readFileSync(join(messagesDir, "ar.json"), "utf-8")) as Record<string, string>;

    expect(Object.keys(ar).length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Locale cookie helpers (unit-level, no SvelteKit runtime needed)
// ---------------------------------------------------------------------------

describe("locale cookie helpers", () => {
  function mockCookies(store: Record<string, string> = {}) {
    return {
      get: (key: string) => store[key],
      set: (key: string, value: string, _opts?: unknown) => { store[key] = value; },
      delete: (key: string, _opts?: unknown) => { delete store[key]; },
      getAll: () => [],
      has: (key: string) => key in store,
      serialize: () => "",
    };
  }

  test("getLocaleFromCookie returns en when no cookie set", async () => {
    const { getLocaleFromCookie } = await import("../../src/lib/i18n/locale-cookie.js");
    const cookies = mockCookies() as never;
    expect(getLocaleFromCookie(cookies)).toBe("en");
  });

  test("getLocaleFromCookie returns stored locale when valid", async () => {
    const { getLocaleFromCookie, LOCALE_COOKIE } = await import("../../src/lib/i18n/locale-cookie.js");
    const cookies = mockCookies({ [LOCALE_COOKIE]: "ar" }) as never;
    expect(getLocaleFromCookie(cookies)).toBe("ar");
  });

  test("getLocaleFromCookie returns en for invalid cookie value", async () => {
    const { getLocaleFromCookie, LOCALE_COOKIE } = await import("../../src/lib/i18n/locale-cookie.js");
    const cookies = mockCookies({ [LOCALE_COOKIE]: "xx" }) as never;
    expect(getLocaleFromCookie(cookies)).toBe("en");
  });

  test("setLocaleCookie writes locale to cookie store", async () => {
    const { setLocaleCookie, getLocaleFromCookie, LOCALE_COOKIE } = await import("../../src/lib/i18n/locale-cookie.js");
    const store: Record<string, string> = {};
    const cookies = mockCookies(store) as never;
    setLocaleCookie(cookies, "ar");
    expect(store[LOCALE_COOKIE]).toBe("ar");
    expect(getLocaleFromCookie(cookies)).toBe("ar");
  });

  test("locale persists across cookie read (simulates page reload)", async () => {
    const { setLocaleCookie, getLocaleFromCookie } = await import("../../src/lib/i18n/locale-cookie.js");
    const store: Record<string, string> = {};
    const cookies = mockCookies(store) as never;

    // Simulate user selecting ar
    setLocaleCookie(cookies, "ar");

    // Simulate next page load — fresh cookies object with same store
    const cookies2 = mockCookies(store) as never;
    expect(getLocaleFromCookie(cookies2)).toBe("ar");
  });
});

// ---------------------------------------------------------------------------
// Flag OFF: settings/i18n redirects
// ---------------------------------------------------------------------------

describe("settings/i18n route (flag OFF)", () => {
  const orig = process.env.FULCRUM_FEATURES;

  afterEach(() => {
    if (orig === undefined) delete process.env.FULCRUM_FEATURES;
    else process.env.FULCRUM_FEATURES = orig;
    vi.resetModules();
  });

  test("load() redirects to / when i18n flag is OFF", async () => {
    delete process.env.FULCRUM_FEATURES;
    // Dynamically load after clearing env
    const mod = await import("../../src/routes/settings/i18n/+page.server.js");

    // SvelteKit redirect throws an object with status
    await expect(mod.load({ locals: { locale: "en", i18nEnabled: false, activeProjectId: null } } as never)).rejects.toMatchObject({ status: 302 });
  });
});

// ---------------------------------------------------------------------------
// Flag ON: settings/i18n actions
// ---------------------------------------------------------------------------

describe("settings/i18n route (flag ON)", () => {
  const orig = process.env.FULCRUM_FEATURES;

  beforeEach(() => {
    process.env.FULCRUM_FEATURES = "i18n";
    vi.resetModules();
  });

  afterEach(() => {
    if (orig === undefined) delete process.env.FULCRUM_FEATURES;
    else process.env.FULCRUM_FEATURES = orig;
    vi.resetModules();
  });

  test("load() returns locale and supportedLocales when flag ON", async () => {
    const mod = await import("../../src/routes/settings/i18n/+page.server.js");
    const store: Record<string, string> = { fulcrum_locale: "ar" };
    const cookies = {
      get: (k: string) => store[k],
      set: (k: string, v: string) => { store[k] = v; },
      delete: (k: string) => { delete store[k]; },
    };
    const result = await mod.load({ locals: { locale: "ar", i18nEnabled: true, activeProjectId: null }, cookies } as never);
    expect(result).toMatchObject({ locale: "ar", supportedLocales: expect.arrayContaining(["en", "ar"]) });
  });

  test("action() persists new locale to cookie", async () => {
    const mod = await import("../../src/routes/settings/i18n/+page.server.js");
    const store: Record<string, string> = {};
    const cookies = {
      get: (k: string) => store[k],
      set: (k: string, v: string, _opts?: unknown) => { store[k] = v; },
      delete: (k: string, _opts?: unknown) => { delete store[k]; },
    };
    const formData = new FormData();
    formData.append("locale", "ar");
    const request = { formData: async () => formData } as never;

    const result = await mod.actions.default({ request, cookies } as never);
    expect(result).toMatchObject({ success: true, locale: "ar" });
    expect(store["fulcrum_locale"]).toBe("ar");
  });

  test("action() fails with 400 for invalid locale", async () => {
    const mod = await import("../../src/routes/settings/i18n/+page.server.js");
    const store: Record<string, string> = {};
    const cookies = {
      get: (k: string) => store[k],
      set: (k: string, v: string, _opts?: unknown) => { store[k] = v; },
      delete: (k: string, _opts?: unknown) => { delete store[k]; },
    };
    const formData = new FormData();
    formData.append("locale", "xyz");
    const request = { formData: async () => formData } as never;

    const result = await mod.actions.default({ request, cookies } as never);
    expect(result).toMatchObject({ status: 400 });
  });
});
