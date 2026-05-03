import { describe, expect, test } from "bun:test";

import { TuiApp, type TuiCaller } from "../../src/tui/index.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

describe("TuiApp bell counter poll", () => {
  test("status bar loads notify.unreadCount and polls every 60 seconds", async () => {
    const intervals: Array<{ ms: number; callback: () => void | Promise<void> }> = [];
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = ((callback: () => void | Promise<void>, ms?: number) => {
      intervals.push({ ms: ms ?? 0, callback });
      return intervals.length as never;
    }) as typeof setInterval;
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
      expect(output.plainText()).toContain("Bell:2");
      expect(intervals.some((interval) => interval.ms === 60_000)).toBe(true);

      await intervals.find((interval) => interval.ms === 60_000)?.callback();
      expect(output.plainText()).toContain("Bell:7");

      tui.stop();
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });
});
