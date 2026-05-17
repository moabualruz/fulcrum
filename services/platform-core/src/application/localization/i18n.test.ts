import { describe, expect, test } from "bun:test";

import { dirForLocale, isI18nEnabled, normalizeLocale, setLocale, t } from "./index.ts";

const SETTINGS_TITLE_KEYS = [
  "settings.i18n.title",
  "settings.theme.title",
  "settings.telemetry.title",
  "settings.errors.title",
  "settings.backups.title",
  "settings.data.title",
  "settings.secrets.title",
  "settings.audit.title",
] as const;

describe("i18n", () => {
  test("t resolves English and Arabic strings when i18n flag is on", () => {
    const previous = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "i18n";
    try {
      setLocale("en");
      expect(t("common.save")).toBe("Save");
      setLocale("ar");
      expect(t("common.save")).toBe("[ar]Save");
    } finally {
      if (previous === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previous;
      setLocale("en");
    }
  });

  test("RTL locales set correct dir only when i18n is enabled", () => {
    const previous = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    try {
      expect(isI18nEnabled()).toBe(false);
      expect(dirForLocale("ar")).toBe(null);
      process.env["FULCRUM_FEATURES"] = "i18n";
      expect(dirForLocale("ar")).toBe("rtl");
      expect(dirForLocale("fr")).toBe("ltr");
    } finally {
      if (previous === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previous;
    }
  });

  test("normalizes unsupported locales to English", () => {
    expect(normalizeLocale("fr")).toBe("fr");
    expect(normalizeLocale("AR")).toBe("ar");
    expect(normalizeLocale("de")).toBe("en");
  });

  test("settings title keys exist in en, fr, and ar catalogs", () => {
    for (const key of SETTINGS_TITLE_KEYS) {
      expect(t(key, "en")).not.toBe(key);
      expect(t(key, "fr")).not.toBe(key);
      expect(t(key, "ar")).not.toBe(key);
    }
  });
});
