import { AppValidationError } from "@platform-core/domain/errors.ts";

export const THEME_TOKEN_DEFAULTS = {
  "theme.accent": "#6D28D9",
  "theme.radius": "8px",
  "theme.font-family": "Inter, system-ui, sans-serif",
  "theme.spacing-unit": "4px",
  "theme.animation-duration": "150ms",
  "theme.dark-mode": "auto",
} as const;

export type ThemeTokenKey = keyof typeof THEME_TOKEN_DEFAULTS;

export interface ThemeTokenSetting {
  key: ThemeTokenKey;
  value: string;
  defaultValue: string;
}

export const THEME_PROFILE_DEFAULTS = {
  accentHue: 262,
  accentSaturation: 83,
  accentLightness: 58,
  radius: 0.5,
  fontFamily: "inter",
  colorScheme: "auto",
  compactMode: false,
  animationSpeed: "normal",
  preset: "default",
} as const;

export type ThemeProfileSettings = {
  accentHue: number;
  accentSaturation: number;
  accentLightness: number;
  radius: number;
  fontFamily: "inter" | "system" | "mono";
  colorScheme: "light" | "dark" | "auto";
  compactMode: boolean;
  animationSpeed: "normal" | "reduced" | "off";
  preset: "default" | "ocean" | "forest" | "sunset" | "monochrome";
};

export type ThemeScope = {
  orgId: string;
  userId: string;
};

export type RawThemeSetting = {
  key: string;
  value: string;
};

const THEME_PROFILE_KEYS = Object.keys(THEME_PROFILE_DEFAULTS) as Array<keyof ThemeProfileSettings>;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function normalizeThemeTokenKey(key: string): ThemeTokenKey {
  const normalized = key.startsWith("theme.") ? key : `theme.${key}`;
  if (normalized in THEME_TOKEN_DEFAULTS) return normalized as ThemeTokenKey;
  throw new AppValidationError(`Unknown theme key '${key}'.`);
}

export function validateThemeTokenValue(key: ThemeTokenKey, value: string): string {
  const trimmed = value.trim();
  if (key === "theme.accent" && !HEX_COLOR.test(trimmed)) {
    throw new AppValidationError("theme.accent must be a 6-digit HEX color.");
  }
  if (key === "theme.dark-mode" && !["light", "dark", "auto"].includes(trimmed)) {
    throw new AppValidationError("theme.dark-mode must be light, dark, or auto.");
  }
  return trimmed;
}

export function themeTokenSetting(
  key: ThemeTokenKey,
  overrides: Map<string, string>,
): ThemeTokenSetting {
  const defaultValue = THEME_TOKEN_DEFAULTS[key];
  return { key, value: overrides.get(key) ?? defaultValue, defaultValue };
}

export function listThemeTokenSettings(overrides: readonly RawThemeSetting[]): ThemeTokenSetting[] {
  const overrideMap = new Map(overrides.map((item) => [item.key, item.value]));
  return (Object.keys(THEME_TOKEN_DEFAULTS) as ThemeTokenKey[]).map((key) =>
    themeTokenSetting(key, overrideMap)
  );
}

export function themeProfileKey(key: keyof ThemeProfileSettings): string {
  return `theme.profile.${key}`;
}

export function themeProfileFromSettings(overrides: readonly RawThemeSetting[]): ThemeProfileSettings {
  const values = new Map(overrides.map((item) => [item.key, item.value]));
  return {
    accentHue: Number(values.get(themeProfileKey("accentHue")) ?? THEME_PROFILE_DEFAULTS.accentHue),
    accentSaturation: Number(values.get(themeProfileKey("accentSaturation")) ?? THEME_PROFILE_DEFAULTS.accentSaturation),
    accentLightness: Number(values.get(themeProfileKey("accentLightness")) ?? THEME_PROFILE_DEFAULTS.accentLightness),
    radius: Number(values.get(themeProfileKey("radius")) ?? THEME_PROFILE_DEFAULTS.radius),
    fontFamily: (values.get(themeProfileKey("fontFamily")) ?? THEME_PROFILE_DEFAULTS.fontFamily) as ThemeProfileSettings["fontFamily"],
    colorScheme: (values.get(themeProfileKey("colorScheme")) ?? THEME_PROFILE_DEFAULTS.colorScheme) as ThemeProfileSettings["colorScheme"],
    compactMode: (values.get(themeProfileKey("compactMode")) ?? String(THEME_PROFILE_DEFAULTS.compactMode)) === "true",
    animationSpeed: (values.get(themeProfileKey("animationSpeed")) ?? THEME_PROFILE_DEFAULTS.animationSpeed) as ThemeProfileSettings["animationSpeed"],
    preset: (values.get(themeProfileKey("preset")) ?? THEME_PROFILE_DEFAULTS.preset) as ThemeProfileSettings["preset"],
  };
}

export function themeProfileEntries(input: Partial<ThemeProfileSettings>): RawThemeSetting[] {
  return THEME_PROFILE_KEYS
    .filter((key) => input[key] !== undefined)
    .map((key) => ({ key: themeProfileKey(key), value: String(input[key]) }));
}
