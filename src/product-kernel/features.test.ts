import { describe, expect, test } from "bun:test";
import { isFeatureEnabled, parseFeatureFlags } from "./features.ts";

describe("feature flags", () => {
  test("empty env returns empty set", () => {
    expect(parseFeatureFlags("")).toEqual(new Set());
    expect(parseFeatureFlags(undefined)).toEqual(new Set());
  });

  test("parses comma-separated known flags", () => {
    const flags = parseFeatureFlags("real-time-collab-server,symphony-ssh-worker");
    expect(flags.has("real-time-collab-server")).toBe(true);
    expect(flags.has("symphony-ssh-worker")).toBe(true);
    expect(flags.has("symphony-http-api")).toBe(false);
  });

  test("ignores unknown flags", () => {
    const flags = parseFeatureFlags("real-time-collab-server,bogus-flag");
    expect(flags.size).toBe(1);
  });

  test("trims whitespace", () => {
    const flags = parseFeatureFlags(" symphony-http-api , real-time-collab-server ");
    expect(flags.has("symphony-http-api")).toBe(true);
    expect(flags.has("real-time-collab-server")).toBe(true);
  });

  test("isFeatureEnabled checks against provided set", () => {
    const flags = parseFeatureFlags("symphony-http-api");
    expect(isFeatureEnabled("symphony-http-api", flags)).toBe(true);
    expect(isFeatureEnabled("symphony-ssh-worker", flags)).toBe(false);
  });
});
