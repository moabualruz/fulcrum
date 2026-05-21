import { describe, expect, test } from "bun:test";

import { TuiApp, type TuiCaller } from "@fulcrum/tui/index.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

describe("TuiApp bell counter poll", () => {
  test("status bar loads notify.unreadCount and polls every 60 seconds", async () => {
    const intervals: Array<{ ms: number; callback: () => void | Promise<void> }> = [];
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = ((callback: unknown, ms?: number) => {
      intervals.push({ ms: ms ?? 0, callback: callback as () => void | Promise<void> });
      return intervals.length as never;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = (() => undefined) as typeof clearInterval;

    const output = new FakeTTY({ columns: 100, rows: 20 });
    const counts = [2, 7];
    const caller: TuiCaller = {
      auth: {
        whoami: async () => ({
          userId: "user-1",
          orgId: "org-1",
          email: "mkh@example.com",
          role: "owner",
        }),
      },
      flags: {
        list: async () => [],
        set: async () => ({ ok: true }),
      },
      notify: {
        unreadCount: async () => ({ count: counts.shift() ?? 0 }),
      },
    };

    try {
      const tui = new TuiApp({ output, caller });
      await tui.mount();
      await tui.waitForStartupData();
      // OD StatusFooter: the unread bell count is folded into the `help`
      // segment as `? 🔔<n>` (StatusBar.ts), not a standalone `Bell:<n>` bar.
      expect(output.plainText()).toContain("🔔2");
      expect(intervals.some((interval) => interval.ms === 60_000)).toBe(true);

      await intervals.find((interval) => interval.ms === 60_000)?.callback();
      expect(output.plainText()).toContain("🔔7");

      tui.stop();
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });
});
