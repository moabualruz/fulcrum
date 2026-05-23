import { describe, expect, test } from "bun:test";

import {
  FOUNDATION_KEY_BINDINGS,
  TOGGLE_THEME_COMMAND,
  clampSelection,
  formatTuiErrorFrame,
  nextThemePreset,
  reflowListViewport,
} from "./tui-foundation.ts";

describe("tui-foundation theme toggle", () => {
  test("key bindings expose a t binding for theme toggle", () => {
    const binding = FOUNDATION_KEY_BINDINGS.find((entry) => entry.key === "t");
    expect(binding).toBeDefined();
    expect(binding?.action).toContain("dark/light");
  });

  test("TOGGLE_THEME_COMMAND is a stable label for palette and help", () => {
    expect(TOGGLE_THEME_COMMAND).toBe("Toggle dark mode");
  });

  test("nextThemePreset flips between dark and light", () => {
    expect(nextThemePreset("dark")).toBe("light");
    expect(nextThemePreset("light")).toBe("dark");
    expect(nextThemePreset(null)).toBe("dark");
    expect(nextThemePreset(undefined)).toBe("dark");
  });
});

describe("formatTuiErrorFrame", () => {
  test("extracts message, single stack excerpt, and default recovery hint", () => {
    const error = new Error("disconnected from API");
    error.stack = "Error: disconnected from API\n    at TuiAppRouter.dispatch (tui-app.ts:42:3)\n    at handler (router.ts:10:5)";
    const frame = formatTuiErrorFrame(error);
    expect(frame.message).toBe("disconnected from API");
    expect(frame.stackExcerpt).toContain("at TuiAppRouter.dispatch");
    expect(frame.recoveryHint).toContain("restart");
  });

  test("falls back to Unknown TUI error for non-Error inputs and honors custom hint", () => {
    const frame = formatTuiErrorFrame(null, "Reconnect to the API");
    expect(frame.message).toBe("Unknown TUI error");
    expect(frame.recoveryHint).toBe("Reconnect to the API");
  });
});

describe("reflowListViewport", () => {
  test("clamps the selection within the available rows", () => {
    expect(clampSelection(5, -3)).toBe(0);
    expect(clampSelection(5, 9)).toBe(4);
    expect(clampSelection(0, 4)).toBe(0);
  });

  test("scrolls down so the selected row stays visible after height shrinks", () => {
    const next = reflowListViewport({ totalRows: 12, selectedIndex: 10, viewportRows: 4, scrollOffset: 0 });
    expect(next.scrollOffset).toBe(7);
    expect(next.selectedIndex).toBe(10);
  });

  test("collapses scrollOffset to 0 when content fits the viewport", () => {
    const next = reflowListViewport({ totalRows: 3, selectedIndex: 2, viewportRows: 10, scrollOffset: 5 });
    expect(next.scrollOffset).toBe(0);
    expect(next.selectedIndex).toBe(2);
  });

  test("scrolls up so the selected row stays visible after offset over-extends", () => {
    const next = reflowListViewport({ totalRows: 12, selectedIndex: 0, viewportRows: 4, scrollOffset: 8 });
    expect(next.scrollOffset).toBe(0);
    expect(next.selectedIndex).toBe(0);
  });

  test("uses a minimum viewport of 1 when the terminal collapses", () => {
    const next = reflowListViewport({ totalRows: 5, selectedIndex: 3, viewportRows: 0, scrollOffset: 0 });
    expect(next.viewportRows).toBe(1);
    expect(next.scrollOffset).toBe(3);
  });
});
