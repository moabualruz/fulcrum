import { z } from "zod";

import {
  getLegacyThemeSettings,
  getThemeSetting,
  listThemeSettings,
  setThemeSetting,
  THEME_DEFAULTS,
  ThemeSettingsRepository,
  updateLegacyThemeSettings,
  type AdminAppContext,
  type LegacyThemeSettings,
  type ThemeKey,
  type ThemeSetting,
} from "../../../application/admin/queries.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

export { THEME_DEFAULTS, ThemeSettingsRepository, type ThemeKey, type ThemeSetting };

const LegacyThemeSettingsSchema: z.ZodType<LegacyThemeSettings> = z.object({
  accentHue: z.number().min(0).max(360),
  accentSaturation: z.number().min(0).max(100),
  accentLightness: z.number().min(0).max(100),
  radius: z.number().min(0).max(1.5),
  fontFamily: z.enum(["inter", "system", "mono"]),
  colorScheme: z.enum(["light", "dark", "auto"]),
  compactMode: z.boolean(),
  animationSpeed: z.enum(["normal", "reduced", "off"]),
  preset: z.enum(["default", "ocean", "forest", "sunset", "monochrome"]),
});

const ThemeKeyInputSchema = z.union([
  z.enum(Object.keys(THEME_DEFAULTS) as [ThemeKey, ...ThemeKey[]]),
  z.enum(["accent", "radius", "font-family", "spacing-unit", "animation-duration", "dark-mode"]),
]);

const ThemeSettingSchema: z.ZodType<ThemeSetting> = z.object({
  key: z.enum(Object.keys(THEME_DEFAULTS) as [ThemeKey, ...ThemeKey[]]),
  value: z.string(),
  defaultValue: z.string(),
});

const GetThemeInputSchema = z.object({ key: ThemeKeyInputSchema });
const SetThemeInputSchema = z.object({
  key: ThemeKeyInputSchema,
  value: z.string().min(1),
});

function appContext({ orgId, userId, em, container }: AdminAppContext): AdminAppContext {
  return { orgId, userId, em, container };
}

export const themeRouter = t.router({
  get: permissionedProcedure({ resource: "theme", action: "getTheme" })
    .output(LegacyThemeSettingsSchema)
    .query(async ({ ctx }) => getLegacyThemeSettings(appContext(ctx))),

  update: permissionedProcedure({ resource: "theme", action: "setTheme" })
    .input(LegacyThemeSettingsSchema)
    .output(LegacyThemeSettingsSchema)
    .mutation(async ({ ctx, input }) => updateLegacyThemeSettings(appContext(ctx), input)),

  listThemes: permissionedProcedure({ resource: "theme", action: "listThemes" })
    .output(z.array(ThemeSettingSchema))
    .query(async ({ ctx }) => listThemeSettings(appContext(ctx))),

  getTheme: permissionedProcedure({ resource: "theme", action: "getTheme" })
    .input(GetThemeInputSchema)
    .output(ThemeSettingSchema)
    .query(async ({ ctx, input }) => getThemeSetting(appContext(ctx), input.key)),

  setTheme: permissionedProcedure({ resource: "theme", action: "setTheme" })
    .input(SetThemeInputSchema)
    .output(ThemeSettingSchema)
    .mutation(async ({ ctx, input }) => setThemeSetting(appContext(ctx), input)),
});
