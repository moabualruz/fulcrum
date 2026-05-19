import { describe, expect, test } from "bun:test";

import {
  isInteractive,
  offlineFooterHint,
  statusBarApiLabel,
} from "./cross-cutting-offline.ts";

describe("cross-cutting offline state", () => {
  test("status bar reports online, reconnecting, and offline labels", () => {
    expect(statusBarApiLabel({ state: "online", lastCheckedAt: null })).toBe("API:online");
    expect(
      statusBarApiLabel({ state: "reconnecting", lastCheckedAt: null, nextRetryInSec: 12 }),
    ).toBe("API:reconnecting (retry in 12s)");
    expect(statusBarApiLabel({ state: "offline", lastCheckedAt: null })).toBe("API:offline");
  });

  test("offline footer hint shows reconnect instructions and failure reason", () => {
    expect(offlineFooterHint({ state: "online", lastCheckedAt: null })).toBe("");
    expect(
      offlineFooterHint({ state: "reconnecting", lastCheckedAt: null, nextRetryInSec: 5 }),
    ).toContain("retry in 5s");
    expect(
      offlineFooterHint({
        state: "offline",
        lastCheckedAt: null,
        failureReason: "ECONNREFUSED at api.fulcrum.local",
      }),
    ).toContain("ECONNREFUSED");
  });

  test("UI is interactive only when API is online", () => {
    expect(isInteractive({ state: "online", lastCheckedAt: null })).toBe(true);
    expect(isInteractive({ state: "reconnecting", lastCheckedAt: null })).toBe(false);
    expect(isInteractive({ state: "offline", lastCheckedAt: null })).toBe(false);
  });
});
