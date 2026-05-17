import type {
  ThemeProfileSettings,
  ThemeScope,
} from "@platform-core/application/theme-settings.ts";

export class ThemeSettingsQueryDto implements ThemeScope {
  orgId!: string;
  userId!: string;
}

export class ThemeTokenParamsDto {
  key!: string;
}

export class ThemeTokenUpsertDto extends ThemeSettingsQueryDto {
  value!: string;
}

export class ThemeProfileUpdateDto extends ThemeSettingsQueryDto implements Partial<ThemeProfileSettings> {
  accentHue?: number;
  accentSaturation?: number;
  accentLightness?: number;
  radius?: number;
  fontFamily?: ThemeProfileSettings["fontFamily"];
  colorScheme?: ThemeProfileSettings["colorScheme"];
  compactMode?: boolean;
  animationSpeed?: ThemeProfileSettings["animationSpeed"];
  preset?: ThemeProfileSettings["preset"];
}
