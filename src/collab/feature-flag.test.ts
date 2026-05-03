import { describe, expect, test } from "bun:test";
import { isCollabEnabled } from "./feature-flag.ts";

describe("isCollabEnabled", () => {
  test("returns false when FULCRUM_FEATURES is unset", () => {
    expect(isCollabEnabled({})).toBe(false);
  });

  test("returns false when FULCRUM_FEATURES is empty", () => {
    expect(isCollabEnabled({ FULCRUM_FEATURES: "" })).toBe(false);
  });

  test("returns true when FULCRUM_FEATURES contains real-time-collab-server", () => {
    expect(isCollabEnabled({ FULCRUM_FEATURES: "real-time-collab-server" })).toBe(true);
  });

  test("returns true when flag is among multiple comma-separated features", () => {
    expect(
      isCollabEnabled({ FULCRUM_FEATURES: "public-api,real-time-collab-server,embeddings" }),
    ).toBe(true);
  });

  test("returns false when flag is partial match only", () => {
    expect(isCollabEnabled({ FULCRUM_FEATURES: "real-time-collab" })).toBe(false);
  });

  test("handles whitespace around flags", () => {
    expect(
      isCollabEnabled({ FULCRUM_FEATURES: " real-time-collab-server , embeddings " }),
    ).toBe(true);
  });
});
