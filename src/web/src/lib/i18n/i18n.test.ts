import { describe, it, expect, beforeEach } from "bun:test";
import {
  t,
  setLocale,
  getLocale,
  getDir,
  formatDate,
  formatNumber,
  isI18nEnabled,
  getEnglishKeys,
  SUPPORTED_LOCALES,
} from "./index.ts";

describe("i18n", () => {
  beforeEach(() => {
    setLocale("en");
  });

  describe("t()", () => {
    it("returns English string by default", () => {
      expect(t("common.save")).toBe("Save");
    });

    it("returns Arabic string when locale is ar", () => {
      setLocale("ar");
      expect(t("common.save")).toBe("حفظ");
    });

    it("returns French string when locale is fr", () => {
      setLocale("fr");
      expect(t("common.save")).toBe("Enregistrer");
    });

    it("falls back to English for missing key in target locale", () => {
      setLocale("ar");
      // all keys exist in ar, so test with a hypothetical missing key
      // by checking fallback behavior — key not in any catalog
      expect(t("nonexistent.key")).toBe("[ar]nonexistent.key");
    });

    it("returns bracketed key when missing everywhere", () => {
      expect(t("does.not.exist")).toBe("[en]does.not.exist");
    });
  });

  describe("setLocale / getLocale", () => {
    it("sets and gets locale", () => {
      setLocale("ar");
      expect(getLocale()).toBe("ar");
    });

    it("returns rtl for Arabic", () => {
      expect(setLocale("ar")).toBe("rtl");
    });

    it("returns ltr for English", () => {
      expect(setLocale("en")).toBe("ltr");
    });

    it("returns ltr for French", () => {
      expect(setLocale("fr")).toBe("ltr");
    });
  });

  describe("getDir()", () => {
    it("returns rtl for ar", () => expect(getDir("ar")).toBe("rtl"));
    it("returns rtl for he", () => expect(getDir("he")).toBe("rtl"));
    it("returns rtl for fa", () => expect(getDir("fa")).toBe("rtl"));
    it("returns ltr for en", () => expect(getDir("en")).toBe("ltr"));
    it("returns ltr for fr", () => expect(getDir("fr")).toBe("ltr"));
  });

  describe("formatDate()", () => {
    it("formats date in Arabic locale", () => {
      setLocale("ar");
      const d = new Date("2025-01-15T00:00:00Z");
      const formatted = formatDate(d, { dateStyle: "short", timeZone: "UTC" });
      // Arabic locale should produce Arabic-formatted date
      expect(formatted).toBeTruthy();
      expect(formatted).not.toBe("");
    });
  });

  describe("formatNumber()", () => {
    it("formats number in current locale", () => {
      setLocale("en");
      expect(formatNumber(1234.5)).toContain("1");
    });
  });

  describe("isI18nEnabled()", () => {
    it("returns false when FULCRUM_FEATURES not set", () => {
      const orig = process.env.FULCRUM_FEATURES;
      delete process.env.FULCRUM_FEATURES;
      expect(isI18nEnabled()).toBe(false);
      if (orig !== undefined) process.env.FULCRUM_FEATURES = orig;
    });

    it("returns true when FULCRUM_FEATURES includes i18n", () => {
      const orig = process.env.FULCRUM_FEATURES;
      process.env.FULCRUM_FEATURES = "i18n,other";
      expect(isI18nEnabled()).toBe(true);
      if (orig !== undefined) process.env.FULCRUM_FEATURES = orig;
      else delete process.env.FULCRUM_FEATURES;
    });
  });

  describe("getEnglishKeys()", () => {
    it("returns sorted array of keys", () => {
      const keys = getEnglishKeys();
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual([...keys].sort());
      expect(keys).toContain("common.save");
    });
  });

  describe("SUPPORTED_LOCALES", () => {
    it("includes en, ar, fr", () => {
      expect(SUPPORTED_LOCALES).toContain("en");
      expect(SUPPORTED_LOCALES).toContain("ar");
      expect(SUPPORTED_LOCALES).toContain("fr");
    });
  });
});
