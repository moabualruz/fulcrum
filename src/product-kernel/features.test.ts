import { describe, expect, test } from "bun:test";
import { isFeatureEnabled, parseFeatures } from "./features.ts";

describe("parseFeatures", () => {
  test("empty string → empty set", () => {
    expect(parseFeatures("")).toEqual(new Set());
  });
  test("undefined → empty set", () => {
    expect(parseFeatures(undefined)).toEqual(new Set());
  });
  test("single flag", () => {
    expect(parseFeatures("public-api")).toEqual(new Set(["public-api"]));
  });
  test("comma-separated, trims whitespace, lowercases", () => {
    expect(parseFeatures(" Public-API , embeddings ")).toEqual(
      new Set(["public-api", "embeddings"]),
    );
  });
});

describe("isFeatureEnabled", () => {
  test("returns true when flag present", () => {
    expect(isFeatureEnabled("public-api", "public-api,embeddings")).toBe(true);
  });
  test("returns false when flag absent", () => {
    expect(isFeatureEnabled("public-api", "embeddings")).toBe(false);
  });
  test("returns false for empty env", () => {
    expect(isFeatureEnabled("public-api", "")).toBe(false);
  });
});
