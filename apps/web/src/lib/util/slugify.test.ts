import { describe, expect, test } from "bun:test";

import { slugify } from "./slugify";

const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

describe("slugify", () => {
  test("lowercases a single word", () => {
    expect(slugify("Fulcrum")).toBe("fulcrum");
  });

  test("collapses spaces between words to hyphens", () => {
    expect(slugify("Fulcrum Web Shell")).toBe("fulcrum-web-shell");
  });

  test("collapses repeated whitespace and trims", () => {
    expect(slugify("  hello   world  ")).toBe("hello-world");
  });

  test("strips diacritics from Latin-extended characters", () => {
    expect(slugify("Café résumé")).toBe("cafe-resume");
  });

  test("strips ASCII punctuation", () => {
    expect(slugify("hello, world!")).toBe("hello-world");
  });

  test("handles ü as u after diacritic strip", () => {
    expect(slugify("über-cool")).toBe("uber-cool");
  });

  test("maps ß to ss for German romanisation", () => {
    expect(slugify("ßetterment")).toBe("ssetterment");
  });

  test("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(slugify("   ")).toBe("");
  });

  test("returns empty string when only hyphens remain", () => {
    expect(slugify("---")).toBe("");
  });

  test("truncates output to 64 characters", () => {
    expect(slugify("a".repeat(80))).toBe("a".repeat(64));
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugify("--leading-hyphens-removed--")).toBe(
      "leading-hyphens-removed",
    );
  });

  test("collapses runs of hyphens to a single hyphen", () => {
    expect(slugify("multi---hyphens")).toBe("multi-hyphens");
  });

  test("returns empty string for non-Latin scripts", () => {
    expect(slugify("中文")).toBe("");
  });

  test("treats underscore as word separator", () => {
    expect(slugify(" snake_case names ")).toBe("snake-case-names");
  });

  test("non-empty output always satisfies the canonical safe-slug regex", () => {
    const inputs = [
      "Fulcrum",
      "Fulcrum Web Shell",
      "  hello   world  ",
      "Café résumé",
      "hello, world!",
      "über-cool",
      "ßetterment",
      "",
      "   ",
      "---",
      "a".repeat(80),
      "--leading-hyphens-removed--",
      "multi---hyphens",
      "中文",
      " snake_case names ",
    ];
    for (const input of inputs) {
      const out = slugify(input);
      if (out !== "") {
        expect(SAFE_SLUG_RE.test(out)).toBe(true);
      }
    }
  });
});
