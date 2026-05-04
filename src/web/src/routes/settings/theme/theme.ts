export interface ThemeSettings {
  accentHue: number;
  accentSaturation: number;
  accentLightness: number;
  radius: number;
  fontFamily: "inter" | "system" | "mono";
  colorScheme: "light" | "dark" | "auto";
  compactMode: boolean;
  animationSpeed: "normal" | "reduced" | "off";
  preset: "default" | "ocean" | "forest" | "sunset" | "monochrome";
}

export const THEME_DEFAULTS: ThemeSettings = {
  accentHue: 262,
  accentSaturation: 83,
  accentLightness: 58,
  radius: 0.5,
  fontFamily: "inter",
  colorScheme: "auto",
  compactMode: false,
  animationSpeed: "normal",
  preset: "default",
};

export const PRESETS: Record<ThemeSettings["preset"], Partial<ThemeSettings>> = {
  default: { accentHue: 262, accentSaturation: 83, accentLightness: 58 },
  ocean: { accentHue: 210, accentSaturation: 90, accentLightness: 50 },
  forest: { accentHue: 140, accentSaturation: 70, accentLightness: 40 },
  sunset: { accentHue: 30, accentSaturation: 90, accentLightness: 55 },
  monochrome: { accentHue: 0, accentSaturation: 0, accentLightness: 50 },
};
