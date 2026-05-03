import { afterEach, describe, expect, test } from "bun:test";
import { isFeatureEnabled, _resetFeatureCache } from "./features.ts";

afterEach(() => {
  _resetFeatureCache();
  delete process.env.FULCRUM_FEATURES;
});

describe("feature flags", () => {
  test("returns false when env var unset", () => {
    expect(isFeatureEnabled("connector-github")).toBe(false);
  });

  test("returns true when feature listed", () => {
    process.env.FULCRUM_FEATURES = "connector-github";
    expect(isFeatureEnabled("connector-github")).toBe(true);
  });

  test("handles comma-separated list", () => {
    process.env.FULCRUM_FEATURES = "foo, connector-github, bar";
    expect(isFeatureEnabled("connector-github")).toBe(true);
  });

  test("returns false when feature not in list", () => {
    process.env.FULCRUM_FEATURES = "other-feature";
    expect(isFeatureEnabled("connector-github")).toBe(false);
  });

  test("connector-bitbucket flag works", () => {
    process.env.FULCRUM_FEATURES = "connector-bitbucket";
    expect(isFeatureEnabled("connector-bitbucket")).toBe(true);
    expect(isFeatureEnabled("connector-github")).toBe(false);
  });

  test("both connectors can be enabled simultaneously", () => {
    process.env.FULCRUM_FEATURES = "connector-github,connector-bitbucket";
    expect(isFeatureEnabled("connector-github")).toBe(true);
    expect(isFeatureEnabled("connector-bitbucket")).toBe(true);
  });
});
