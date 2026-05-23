import { describe, expect, test } from "bun:test";

import { TELEMETRY_SCOPE, TelemetryConsentStore } from "./consent-store.ts";

describe("TelemetryConsentStore", () => {
  test("returns null when settings file is missing", () => {
    const store = new TelemetryConsentStore({
      filePath: "/tmp/missing-telemetry-consent.json",
      reader: () => { throw new Error("ENOENT"); },
      writer: () => {},
    });
    expect(store.read()).toBeNull();
    expect(store.hasDecided()).toBe(false);
  });

  test("persists opt-in decision and round-trips through read", () => {
    let stored = "";
    const store = new TelemetryConsentStore({
      filePath: "/tmp/telemetry-consent.json",
      now: () => new Date("2026-05-19T08:00:00.000Z"),
      reader: () => stored || (() => { throw new Error("ENOENT"); })(),
      writer: (_path, content) => { stored = content; },
    });

    const consent = store.write(true);
    expect(consent.optedIn).toBe(true);
    expect(consent.scope).toEqual(TELEMETRY_SCOPE);
    expect(consent.decidedAt).toBe("2026-05-19T08:00:00.000Z");

    const loaded = store.read();
    expect(loaded).not.toBeNull();
    expect(loaded?.optedIn).toBe(true);
    expect(stored).toContain("\"telemetry\":");
  });

  test("preserves unrelated keys when persisting consent", () => {
    let stored = JSON.stringify({ ui: { density: "compact" } });
    const store = new TelemetryConsentStore({
      filePath: "/tmp/telemetry-consent.json",
      now: () => new Date("2026-05-19T08:00:00.000Z"),
      reader: () => stored,
      writer: (_path, content) => { stored = content; },
    });

    store.write(false);
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    expect(parsed["ui"]).toEqual({ density: "compact" });
    const telemetry = parsed["telemetry"] as { optedIn: boolean };
    expect(telemetry.optedIn).toBe(false);
  });

  test("ignores malformed settings content", () => {
    const store = new TelemetryConsentStore({
      filePath: "/tmp/telemetry-consent.json",
      reader: () => "not-json",
      writer: () => {},
    });
    expect(store.read()).toBeNull();
  });
});
