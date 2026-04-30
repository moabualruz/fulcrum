import { describe, expect, test } from "bun:test";
import { deriveAutoSlug } from "./auto-slug.ts";

describe("deriveAutoSlug", () => {
  test("when slug is untouched, returns slugify(name)", () => {
    expect(deriveAutoSlug("My Project", "", false)).toBe("my-project");
  });

  test("when slug is touched, returns currentSlug unchanged even if name changes", () => {
    expect(deriveAutoSlug("My Project", "custom-slug", true)).toBe("custom-slug");
  });

  test("when slug is untouched and name has casing/whitespace, returns canonical slug", () => {
    expect(deriveAutoSlug("  Hello   World  ", "stale", false)).toBe("hello-world");
  });

  test("when slug is touched and currentSlug is empty, returns empty (manual edit cleared it)", () => {
    expect(deriveAutoSlug("Whatever", "", true)).toBe("");
  });

  test("when slug is untouched and name is empty, returns empty string", () => {
    expect(deriveAutoSlug("", "anything", false)).toBe("");
  });
});
