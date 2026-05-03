import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { isFeatureEnabled, assertFeatureEnabled, FeatureGatedError } from "./feature-gate.ts";

describe("feature-gate", () => {
  const origEnv = process.env.FULCRUM_FEATURES;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
    else process.env.FULCRUM_FEATURES = origEnv;
  });

  test("returns false when env var unset", () => {
    delete process.env.FULCRUM_FEATURES;
    expect(isFeatureEnabled("repo-write-ops")).toBe(false);
  });

  test("returns false when env var empty", () => {
    process.env.FULCRUM_FEATURES = "";
    expect(isFeatureEnabled("repo-write-ops")).toBe(false);
  });

  test("returns true when feature listed", () => {
    process.env.FULCRUM_FEATURES = "repo-write-ops";
    expect(isFeatureEnabled("repo-write-ops")).toBe(true);
  });

  test("returns true when feature in comma-separated list", () => {
    process.env.FULCRUM_FEATURES = "foo,repo-write-ops,bar";
    expect(isFeatureEnabled("repo-write-ops")).toBe(true);
  });

  test("trims whitespace around feature names", () => {
    process.env.FULCRUM_FEATURES = " repo-write-ops , other ";
    expect(isFeatureEnabled("repo-write-ops")).toBe(true);
  });

  test("returns false when feature not in list", () => {
    process.env.FULCRUM_FEATURES = "foo,bar";
    expect(isFeatureEnabled("repo-write-ops")).toBe(false);
  });

  test("assertFeatureEnabled throws FeatureGatedError when off", () => {
    delete process.env.FULCRUM_FEATURES;
    expect(() => assertFeatureEnabled("repo-write-ops")).toThrow(FeatureGatedError);
  });

  test("assertFeatureEnabled does not throw when on", () => {
    process.env.FULCRUM_FEATURES = "repo-write-ops";
    expect(() => assertFeatureEnabled("repo-write-ops")).not.toThrow();
  });

  test("FeatureGatedError has code property", () => {
    const err = new FeatureGatedError("repo-write-ops");
    expect(err.code).toBe("FEATURE_GATED");
    expect(err.feature).toBe("repo-write-ops");
  });
});
