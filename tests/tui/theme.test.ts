import { describe, expect, test } from "bun:test";

import {
  BUILT_IN_THEME_PRESETS,
  ThemeSwitcher,
  buildTheme,
  checkTuiThemePreset,
  truncateAnsi,
  type TenantThemeSettings,
} from "../../src/tui/theme/index.ts";

class MemorySettings implements TenantThemeSettings {
  readonly rows = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.rows.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.rows.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.rows.set(key, value);
  }
}

describe("TUI theme engine", () => {
  test("dark preset exposes ANSI token functions", async () => {
    const theme = await buildTheme(new MemorySettings({ "tui.theme_preset": "dark" }));

    expect(theme.name).toBe("dark");
    expect(theme.colors.bg_panel("panel")).toBe("\x1b[48;5;0mpanel\x1b[49m");
    expect(theme.colors.fg_primary("primary")).toBe("\x1b[38;5;75mprimary\x1b[39m");
  });

  test("tenant CSS color override maps to nearest ANSI 256 color", async () => {
    const settings = new MemorySettings({
      "tui.theme_preset": "dark",
      "--color-primary": "#ff5f00",
    });

    const theme = await buildTheme(settings);

    expect(theme.colors.fg_primary("custom")).toBe("\x1b[38;5;202mcustom\x1b[39m");
  });

  test("theme switcher cycles built-in presets and writes tenant settings", async () => {
    const settings = new MemorySettings({ "tui.theme_preset": "dark" });
    const switcher = new ThemeSwitcher(settings);

    const seen: string[] = [];
    for (let i = 0; i < BUILT_IN_THEME_PRESETS.length + 1; i += 1) {
      seen.push((await switcher.next()).name);
    }

    expect(seen).toEqual(["light", "monokai", "solarized-dark", "dracula", "dark", "light"]);
    expect(settings.rows.get("tui.theme_preset")).toBe("light");
  });

  test("ANSI color wrapping does not break CJK truncation width", async () => {
    const theme = await buildTheme(new MemorySettings({ "tui.theme_preset": "dark" }));
    const wrapped = theme.colors.fg_primary("中文");

    expect(truncateAnsi(wrapped, 4)).toBe("\x1b[38;5;75m中文\x1b[39m");
    expect(truncateAnsi(wrapped, 3)).toBe("\x1b[38;5;75m中\x1b[39m…");
  });

  test("doctor check accepts known presets and warns on unknown preset", async () => {
    await expect(checkTuiThemePreset(new MemorySettings({ "tui.theme_preset": "dracula" }))).resolves.toEqual({
      status: "pass",
      preset: "dracula",
    });

    await expect(checkTuiThemePreset(new MemorySettings({ "tui.theme_preset": "unknown" }))).resolves.toEqual({
      status: "warn",
      preset: "dark",
      message: "Unknown TUI theme preset \"unknown\"; falling back to dark.",
    });
  });
});
