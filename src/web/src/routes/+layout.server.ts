import type { LayoutServerLoad } from "./$types";
import { dirForLocale, isI18nEnabled, normalizeLocale } from "../../../src/i18n/index.ts";
import { getThemeCookieValue, normalizeMode, type ThemeSettings } from "../lib/theme";
import type { KeybindingOverrides } from "../lib/keybindings";

export const load: LayoutServerLoad = async ({ locals, request }) => {
  if (request === undefined) return { activeProjectId: locals.activeProjectId };

  const theme = await readTheme(locals.container, request.headers.get("cookie"));
  const keybindingOverrides = await readKeybindingOverrides(locals.container);
  const featureFlags = await readFeatureFlags(locals.container);
  const locale = await readLocale(locals.container);
  const enabled = featureFlags["i18n"] ?? isI18nEnabled();

  return {
    activeProjectId: locals.activeProjectId,
    theme,
    keybindingOverrides,
    featureFlags,
    i18n: {
      enabled,
      locale,
      dir: dirForLocale(locale, enabled),
    },
  };
};

async function readTheme(container: App.Locals["container"], cookieHeader: string | null): Promise<ThemeSettings> {
  const cookieMode = getThemeCookieValue(cookieHeader);
  const service = resolveService(container, "ThemeService");
  const result = await callOptional<{ mode?: unknown; vars?: Record<string, string> }>(service, "get");

  return {
    mode: cookieMode ?? normalizeMode(result?.mode),
    vars: result?.vars ?? {},
  };
}

async function readKeybindingOverrides(container: App.Locals["container"]): Promise<KeybindingOverrides> {
  const service = resolveService(container, "KeybindingService");
  const result = await callOptional<KeybindingOverrides>(service, "getOverrides");
  return result ?? {};
}

async function readFeatureFlags(container: App.Locals["container"]): Promise<Record<string, boolean>> {
  const service = resolveService(container, "FeatureFlagService");
  const result = await callOptional<Record<string, boolean>>(service, "getAll");
  return result ?? {};
}

async function readLocale(container: App.Locals["container"]): Promise<string> {
  const repo = resolveService(container, "TenantSettingRepository");
  const value = await callOptional<string | null>(repo, "getValueWithKey", "web.locale")
    ?? await callOptional<string | null>(repo, "getValue", "web.locale");
  return normalizeLocale(value);
}

function resolveService(container: App.Locals["container"], token: string): unknown {
  try {
    return container?.get(token);
  } catch {
    return undefined;
  }
}

async function callOptional<T>(service: unknown, method: string, ...args: unknown[]): Promise<T | undefined> {
  const fn = (service as Record<string, unknown> | undefined)?.[method];
  if (typeof fn !== "function") return undefined;
  return (await fn.call(service, ...args)) as T;
}
