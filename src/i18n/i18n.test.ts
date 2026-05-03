import { describe, expect, test } from "bun:test";

import { dirForLocale, isI18nEnabled, setLocale, t } from "./index.ts";

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
});
