import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  parseFeatureFlags,
  isFeatureEnabled,
  setFeatureFlag,
  getEnabledFeatures,
  KNOWN_FLAGS,
  type FeatureFlag,
} from "./feature-flags.ts";
import { isEnvFeatureEnabled } from "../flags/registry.ts";

describe("feature-flags", () => {
  const origEnv = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (origEnv === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = origEnv;
  });

  describe("parseFeatureFlags", () => {
    test("returns empty set when env unset", () => {
      delete process.env["FULCRUM_FEATURES"];
      expect(parseFeatureFlags()).toEqual(new Set());
    });

    test("parses comma-separated flags", () => {
      process.env["FULCRUM_FEATURES"] = "desktop-app,experiments";
      const flags = parseFeatureFlags();
      expect(flags.has("desktop-app")).toBe(true);
      expect(flags.has("experiments")).toBe(true);
      expect(flags.has("casbin-policies")).toBe(false);
    });

    test("trims whitespace", () => {
      process.env["FULCRUM_FEATURES"] = " experiments , scheduled-backups ";
      const flags = parseFeatureFlags();
      expect(flags.has("experiments")).toBe(true);
      expect(flags.has("scheduled-backups")).toBe(true);
    });

    test("ignores unknown flags", () => {
      process.env["FULCRUM_FEATURES"] = "experiments,bogus-flag";
      const flags = parseFeatureFlags();
      expect(flags.has("experiments")).toBe(true);
      expect(flags.size).toBe(1);
    });

    test("handles empty string", () => {
      process.env["FULCRUM_FEATURES"] = "";
      expect(parseFeatureFlags()).toEqual(new Set());
    });
  });

  describe("isFeatureEnabled", () => {
    test("returns true when flag in env", () => {
      process.env["FULCRUM_FEATURES"] = "casbin-policies";
      expect(isFeatureEnabled("casbin-policies")).toBe(true);
    });

    test("returns false when flag not in env", () => {
      process.env["FULCRUM_FEATURES"] = "experiments";
      expect(isFeatureEnabled("desktop-app")).toBe(false);
    });

    test("returns false when env unset", () => {
      delete process.env["FULCRUM_FEATURES"];
      expect(isFeatureEnabled("experiments")).toBe(false);
    });

    test("matches canonical registry env bridge for shared flags", () => {
      process.env["FULCRUM_FEATURES"] = "casbin-policies";
      expect(isFeatureEnabled("casbin-policies")).toBe(isEnvFeatureEnabled("casbin-policies"));
    });
  });

  describe("setFeatureFlag", () => {
    test("enables flag and updates env", () => {
      delete process.env["FULCRUM_FEATURES"];
      setFeatureFlag("experiments", true);
      expect(isFeatureEnabled("experiments")).toBe(true);
      expect(process.env["FULCRUM_FEATURES"]).toContain("experiments");
    });

    test("disables flag and updates env", () => {
      process.env["FULCRUM_FEATURES"] = "experiments,desktop-app";
      setFeatureFlag("experiments", false);
      expect(isFeatureEnabled("experiments")).toBe(false);
      expect(isFeatureEnabled("desktop-app")).toBe(true);
    });

    test("toggling one flag does not affect others", () => {
      process.env["FULCRUM_FEATURES"] = "experiments,desktop-app,casbin-policies";
      setFeatureFlag("experiments", false);
      expect(isFeatureEnabled("desktop-app")).toBe(true);
      expect(isFeatureEnabled("casbin-policies")).toBe(true);
      expect(isFeatureEnabled("experiments")).toBe(false);
    });
  });

  describe("getEnabledFeatures", () => {
    test("returns array of enabled flags", () => {
      process.env["FULCRUM_FEATURES"] = "experiments,scheduled-backups";
      const enabled = getEnabledFeatures();
      expect(enabled).toEqual(["experiments", "scheduled-backups"]);
    });
  });

  describe("KNOWN_FLAGS", () => {
    test("contains canonical gated features", () => {
      expect(KNOWN_FLAGS).toContain("desktop-app");
      expect(KNOWN_FLAGS).toContain("experiments");
      expect(KNOWN_FLAGS).toContain("casbin-policies");
      expect(KNOWN_FLAGS).toContain("scheduled-backups");
      expect(KNOWN_FLAGS).toContain("public-api");
    });
  });
});
