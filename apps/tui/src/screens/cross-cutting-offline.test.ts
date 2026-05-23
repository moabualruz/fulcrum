import { describe, expect, test } from "bun:test";

import {
  RECONNECT_HOTKEY,
  enqueueWhileOffline,
  flushAfterReconnect,
  footerStatusToken,
  isInteractive,
  isReconnectHotkey,
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

  test("footerStatusToken returns ok / disconnected / reconnecting with retry hint", () => {
    expect(footerStatusToken({ state: "online", lastCheckedAt: null })).toEqual({
      label: "ok",
      tone: "default",
      retryHint: "",
    });
    expect(
      footerStatusToken({ state: "offline", lastCheckedAt: null, failureReason: "ECONNREFUSED" }),
    ).toMatchObject({ label: "disconnected", tone: "danger" });
    const reconnecting = footerStatusToken({ state: "reconnecting", lastCheckedAt: null, nextRetryInSec: 4 });
    expect(reconnecting.label).toBe("reconnecting");
    expect(reconnecting.retryHint).toContain("retry in 4s");
  });

  test("offline ops queue while disconnected and flush on reconnect", () => {
    const op = { id: "create-task-1", description: "Create task", enqueuedAt: "2026-05-19T01:00:00Z" };
    const offline = { state: "offline" as const, lastCheckedAt: null };
    const queued = enqueueWhileOffline({ queued: [] }, op, offline);
    expect(queued.queued).toHaveLength(1);

    const flushed = flushAfterReconnect(queued, { state: "online", lastCheckedAt: null });
    expect(flushed.queued).toHaveLength(0);
  });

  test("reconnect hotkey is the literal 'r'", () => {
    expect(RECONNECT_HOTKEY).toBe("r");
    expect(isReconnectHotkey("r")).toBe(true);
    expect(isReconnectHotkey("R")).toBe(false);
  });
});
