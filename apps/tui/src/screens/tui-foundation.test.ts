import { describe, expect, test } from "bun:test";

import {
  FOUNDATION_KEY_BINDINGS,
  TOGGLE_THEME_COMMAND,
  nextThemePreset,
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
