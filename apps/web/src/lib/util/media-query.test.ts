import { afterEach, describe, expect, test } from "bun:test";

import {
  BREAKPOINTS,
  browserDriver,
  isMobileViewport,
  MOBILE_QUERY,
  type MediaQueryDriver,
} from "./media-query.ts";

describe("media-query helper", () => {
  test("breakpoints match the canonical Tailwind viewport ladder", () => {
    expect(BREAKPOINTS).toEqual({
      xs: 480,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      "2xl": 1536,
    });
  });

  test("MOBILE_QUERY is the canonical (max-width: 767px)", () => {
    expect(MOBILE_QUERY).toBe("(max-width: 767px)");
  });

  test("isMobileViewport returns true when driver matches the canonical query", () => {
    let captured = "";
    const driver: MediaQueryDriver = {
      matches(q) {
        captured = q;
        return true;
      },
    };
    expect(isMobileViewport(driver)).toBe(true);
    expect(captured).toBe(MOBILE_QUERY);
  });

  test("isMobileViewport returns false when driver returns false", () => {
    const driver: MediaQueryDriver = { matches: () => false };
    expect(isMobileViewport(driver)).toBe(false);
  });

  describe("browserDriver", () => {
    const original = (globalThis as { matchMedia?: unknown }).matchMedia;

    afterEach(() => {
      if (typeof original === "undefined") {
        delete (globalThis as { matchMedia?: unknown }).matchMedia;
      } else {
        (globalThis as { matchMedia?: unknown }).matchMedia = original;
      }
    });

    test("returns false when matchMedia is unavailable", () => {
      delete (globalThis as { matchMedia?: unknown }).matchMedia;
      const driver = browserDriver();
      expect(driver.matches("(max-width: 767px)")).toBe(false);
    });

    test("delegates to globalThis.matchMedia when available", () => {
      const calls: string[] = [];
      (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia =
        (q: string) => {
          calls.push(q);
          return { matches: true };
        };
      const driver = browserDriver();
      expect(driver.matches("(max-width: 767px)")).toBe(true);
      expect(calls).toEqual(["(max-width: 767px)"]);
    });
  });
});
