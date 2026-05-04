export const THEME_PRESET_SETTING = "tui.theme_preset";

const CSS_COLOR_KEYS = [
  "--color-primary",
  "--color-bg",
  "--color-surface",
  "--color-muted",
  "--color-success",
  "--color-destructive",
] as const;

type CssColorKey = (typeof CSS_COLOR_KEYS)[number];

export type ThemePresetName = "dark" | "light" | "monokai" | "solarized-dark" | "dracula";

export type ThemeToken = (value: string) => string;

export interface TuiTheme {
  name: ThemePresetName;
  cssVars: Record<CssColorKey, string>;
  colors: {
    fg_primary: ThemeToken;
    fg_muted: ThemeToken;
    bg_panel: ThemeToken;
    bg_focused: ThemeToken;
    border: ThemeToken;
    success: ThemeToken;
    warning: ThemeToken;
    error: ThemeToken;
  };
}

export interface TenantThemeSettings {
  get(key: string): Promise<string | null> | string | null;
  set?(key: string, value: string): Promise<void> | void;
}

export interface TuiThemePresetCheck {
  status: "pass" | "warn";
  preset: ThemePresetName;
  message?: string;
}

type PresetDefinition = Record<CssColorKey, string> & { "--color-warning": string; "--color-border": string; "--color-focused": string };

export const BUILT_IN_THEME_PRESETS: readonly ThemePresetName[] = [
  "dark",
  "light",
  "monokai",
  "solarized-dark",
  "dracula",
];

const PRESETS: Record<ThemePresetName, PresetDefinition> = {
  dark: {
    "--color-primary": "#5fafff",
    "--color-bg": "#000000",
    "--color-surface": "#000000",
    "--color-muted": "#808080",
    "--color-success": "#00af5f",
    "--color-destructive": "#d70000",
    "--color-warning": "#d7af00",
    "--color-border": "#5f5f5f",
    "--color-focused": "#1c1c1c",
  },
  light: {
    "--color-primary": "#005faf",
    "--color-bg": "#ffffff",
    "--color-surface": "#eeeeee",
    "--color-muted": "#6c6c6c",
    "--color-success": "#00875f",
    "--color-destructive": "#d70000",
    "--color-warning": "#af8700",
    "--color-border": "#bcbcbc",
    "--color-focused": "#d7ffff",
  },
  monokai: {
    "--color-primary": "#66d9ef",
    "--color-bg": "#1c1c1c",
    "--color-surface": "#262626",
    "--color-muted": "#a6a6a6",
    "--color-success": "#a6e22e",
    "--color-destructive": "#f92672",
    "--color-warning": "#e6db74",
    "--color-border": "#75715e",
    "--color-focused": "#3a3a3a",
  },
  "solarized-dark": {
    "--color-primary": "#268bd2",
    "--color-bg": "#002b36",
    "--color-surface": "#073642",
    "--color-muted": "#839496",
    "--color-success": "#859900",
    "--color-destructive": "#dc322f",
    "--color-warning": "#b58900",
    "--color-border": "#586e75",
    "--color-focused": "#073642",
  },
  dracula: {
    "--color-primary": "#bd93f9",
    "--color-bg": "#282a36",
    "--color-surface": "#44475a",
    "--color-muted": "#6272a4",
    "--color-success": "#50fa7b",
    "--color-destructive": "#ff5555",
    "--color-warning": "#f1fa8c",
    "--color-border": "#6272a4",
    "--color-focused": "#44475a",
  },
};

export async function buildTheme(settings: TenantThemeSettings): Promise<TuiTheme> {
  const presetName = await resolvePresetName(settings);
  const preset = PRESETS[presetName];
  const cssVars = { ...preset };

  for (const key of CSS_COLOR_KEYS) {
    const override = normalizeHex(await settings.get(key));
    if (override) cssVars[key] = override;
  }

  return {
    name: presetName,
    cssVars,
    colors: {
      fg_primary: fg(cssVars["--color-primary"]),
      fg_muted: fg(cssVars["--color-muted"]),
      bg_panel: bg(cssVars["--color-surface"]),
      bg_focused: bg(cssVars["--color-focused"]),
      border: fg(cssVars["--color-border"]),
      success: fg(cssVars["--color-success"]),
      warning: fg(cssVars["--color-warning"]),
      error: fg(cssVars["--color-destructive"]),
    },
  };
}

export class ThemeSwitcher {
  constructor(private readonly settings: TenantThemeSettings) {}

  async next(): Promise<TuiTheme> {
    if (!this.settings.set) throw new Error("ThemeSwitcher requires writable tenant settings.");

    const current = await resolvePresetName(this.settings);
    const currentIndex = BUILT_IN_THEME_PRESETS.indexOf(current);
    const nextName = BUILT_IN_THEME_PRESETS[(currentIndex + 1) % BUILT_IN_THEME_PRESETS.length] ?? "dark";
    await this.settings.set(THEME_PRESET_SETTING, nextName);
    return buildTheme(this.settings);
  }
}

export async function checkTuiThemePreset(settings: TenantThemeSettings): Promise<TuiThemePresetCheck> {
  const raw = await settings.get(THEME_PRESET_SETTING);
  if (isThemePresetName(raw)) return { status: "pass", preset: raw };

  if (raw === null || raw === "") return { status: "pass", preset: "dark" };

  return {
    status: "warn",
    preset: "dark",
    message: `Unknown TUI theme preset "${raw}"; falling back to dark.`,
  };
}

export function truncateAnsi(value: string, maxWidth: number): string {
  const segments = parseAnsiSegments(value);
  let width = 0;
  let output = "";
  const activeCodes: string[] = [];

  for (const segment of segments) {
    if (segment.type === "ansi") {
      output += segment.value;
      if (segment.value.endsWith("m")) {
        if (segment.value === "\x1b[39m" || segment.value === "\x1b[49m" || segment.value === "\x1b[0m") activeCodes.length = 0;
        else activeCodes.push(segment.value);
      }
      continue;
    }

    for (const char of Array.from(segment.value)) {
      const charWidth = visualWidth(char);
      if (width + charWidth > maxWidth) return output + closingCodes(activeCodes) + "…";
      output += char;
      width += charWidth;
    }
  }

  return output;
}

async function resolvePresetName(settings: TenantThemeSettings): Promise<ThemePresetName> {
  const raw = await settings.get(THEME_PRESET_SETTING);
  return isThemePresetName(raw) ? raw : "dark";
}

function isThemePresetName(value: unknown): value is ThemePresetName {
  return typeof value === "string" && BUILT_IN_THEME_PRESETS.includes(value as ThemePresetName);
}

function fg(hex: string): ThemeToken {
  const code = nearestAnsi256(hex);
  return (value) => `\x1b[38;5;${code}m${value}\x1b[39m`;
}

function bg(hex: string): ThemeToken {
  const code = nearestAnsi256(hex);
  return (value) => `\x1b[48;5;${code}m${value}\x1b[49m`;
}

function nearestAnsi256(hex: string): number {
  const rgb = hexToRgb(hex);
  let bestCode = 16;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let code = 0; code <= 255; code += 1) {
    const candidate = ansi256ToRgb(code);
    const distance =
      (rgb.r - candidate.r) ** 2 +
      (rgb.g - candidate.g) ** 2 +
      (rgb.b - candidate.b) ** 2;
    if (distance < bestDistance) {
      bestCode = code;
      bestDistance = distance;
    }
  }

  return bestCode;
}

function normalizeHex(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex) ?? "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function ansi256ToRgb(code: number): { r: number; g: number; b: number } {
  if (code < 16) {
    const table = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ] as const;
    const [r, g, b] = table[code] ?? table[0];
    return { r, g, b };
  }

  if (code >= 232) {
    const level = 8 + (code - 232) * 10;
    return { r: level, g: level, b: level };
  }

  const offset = code - 16;
  const r = Math.floor(offset / 36);
  const g = Math.floor((offset % 36) / 6);
  const b = offset % 6;
  return {
    r: ansiLevel(r),
    g: ansiLevel(g),
    b: ansiLevel(b),
  };
}

function ansiLevel(value: number): number {
  return value === 0 ? 0 : 55 + value * 40;
}

function parseAnsiSegments(value: string): Array<{ type: "ansi" | "text"; value: string }> {
  const segments: Array<{ type: "ansi" | "text"; value: string }> = [];
  const ansiPattern = /\x1b\[[0-9;]*m/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiPattern.exec(value)) !== null) {
    if (match.index > cursor) segments.push({ type: "text", value: value.slice(cursor, match.index) });
    segments.push({ type: "ansi", value: match[0] });
    cursor = ansiPattern.lastIndex;
  }

  if (cursor < value.length) segments.push({ type: "text", value: value.slice(cursor) });
  return segments;
}

function closingCodes(activeCodes: readonly string[]): string {
  const closeFg = activeCodes.some((code) => code.startsWith("\x1b[38;"));
  const closeBg = activeCodes.some((code) => code.startsWith("\x1b[48;"));
  return `${closeFg ? "\x1b[39m" : ""}${closeBg ? "\x1b[49m" : ""}`;
}

function visualWidth(char: string): number {
  return /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(char)
    ? 2
    : 1;
}
