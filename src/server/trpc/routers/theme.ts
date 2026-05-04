import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import type { AuthenticatedContext } from "../../../trpc/middleware.ts";

export const THEME_DEFAULTS = {
  "theme.accent": "#6D28D9",
  "theme.radius": "8px",
  "theme.font-family": "Inter, system-ui, sans-serif",
  "theme.spacing-unit": "4px",
  "theme.animation-duration": "150ms",
  "theme.dark-mode": "auto",
} as const;

export type ThemeKey = keyof typeof THEME_DEFAULTS;

export type ThemeSetting = {
  key: ThemeKey;
  value: string;
  defaultValue: string;
};

export type RawThemeSetting = {
  key: string;
  value: string;
};

export abstract class ThemeSettingsRepository {
  abstract listThemeSettings(orgId: string, userId: string): Promise<RawThemeSetting[]>;
  abstract upsertThemeSetting(orgId: string, userId: string, key: string, value: string): Promise<void>;
}

const ThemeKeyInputSchema = z.union([
  z.enum(Object.keys(THEME_DEFAULTS) as [ThemeKey, ...ThemeKey[]]),
  z.enum(["accent", "radius", "font-family", "spacing-unit", "animation-duration", "dark-mode"]),
]);

const ThemeSettingSchema = z.object({
  key: z.enum(Object.keys(THEME_DEFAULTS) as [ThemeKey, ...ThemeKey[]]),
  value: z.string(),
  defaultValue: z.string(),
});

const GetThemeInputSchema = z.object({ key: ThemeKeyInputSchema });
const SetThemeInputSchema = z.object({
  key: ThemeKeyInputSchema,
  value: z.string().min(1),
});

function normalizeThemeKey(key: z.infer<typeof ThemeKeyInputSchema>): ThemeKey {
  const normalized = key.startsWith("theme.") ? key : `theme.${key}`;
  if (normalized in THEME_DEFAULTS) return normalized as ThemeKey;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Unknown theme key '${key}'.`,
  });
}

function validateThemeValue(key: ThemeKey, value: string): string {
  const trimmed = value.trim();

  if (key === "theme.accent" && !/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "theme.accent must be a 6-digit HEX color.",
    });
  }

  if (key === "theme.dark-mode" && !["light", "dark", "auto"].includes(trimmed)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "theme.dark-mode must be light, dark, or auto.",
    });
  }

  return trimmed;
}

function repoFromContext(ctx: AuthenticatedContext): ThemeSettingsRepository {
  if (!ctx.container?.has(ThemeSettingsRepository)) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Theme settings repository is not configured.",
    });
  }

  return ctx.container.get(ThemeSettingsRepository);
}

async function readThemeMap(ctx: AuthenticatedContext): Promise<Map<ThemeKey, string>> {
  const repo = repoFromContext(ctx);
  const overrides = await repo.listThemeSettings(ctx.orgId, ctx.userId);
  const values = new Map<ThemeKey, string>();

  for (const item of overrides) {
    if (!(item.key in THEME_DEFAULTS)) continue;
    values.set(item.key as ThemeKey, item.value);
  }

  return values;
}

function themeSetting(key: ThemeKey, overrides: Map<ThemeKey, string>): ThemeSetting {
  const defaultValue = THEME_DEFAULTS[key];
  return {
    key,
    value: overrides.get(key) ?? defaultValue,
    defaultValue,
  };
}

export const themeRouter = t.router({
  listThemes: permissionedProcedure({ resource: "theme", action: "listThemes" })
    .output(z.array(ThemeSettingSchema))
    .query(async ({ ctx }) => {
      const overrides = await readThemeMap(ctx);
      return (Object.keys(THEME_DEFAULTS) as ThemeKey[]).map((key) =>
        themeSetting(key, overrides),
      );
    }),

  getTheme: permissionedProcedure({ resource: "theme", action: "getTheme" })
    .input(GetThemeInputSchema)
    .output(ThemeSettingSchema)
    .query(async ({ ctx, input }) => {
      const key = normalizeThemeKey(input.key);
      const overrides = await readThemeMap(ctx);
      return themeSetting(key, overrides);
    }),

  setTheme: permissionedProcedure({ resource: "theme", action: "setTheme" })
    .input(SetThemeInputSchema)
    .output(ThemeSettingSchema)
    .mutation(async ({ ctx, input }) => {
      const key = normalizeThemeKey(input.key);
      const value = validateThemeValue(key, input.value);
      const repo = repoFromContext(ctx);
      await repo.upsertThemeSetting(ctx.orgId, ctx.userId, key, value);
      return { key, value, defaultValue: THEME_DEFAULTS[key] };
    }),
});
