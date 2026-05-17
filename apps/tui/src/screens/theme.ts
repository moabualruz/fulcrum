export interface ThemeScreenSetting {
  key: string;
  value: string;
  defaultValue: string;
}

export function renderThemeScreen(settings: readonly ThemeScreenSetting[]): string[] {
  return settings.map((setting) => `${setting.key}: ${setting.value} (default ${setting.defaultValue})`);
}
