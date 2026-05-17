import { fail, redirect } from "@sveltejs/kit";
import { THEME_DEFAULTS, type ThemeSettings } from "./theme";
import { createThemeSettingsApiCaller } from "@platform-core/interface/http/theme-settings-api-client.ts";

interface RouteLocals {
  session: unknown;
  orgId?: string;
  userId?: string;
}

interface LoadEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

interface ActionEvent extends LoadEvent {
  request: LoadEvent["request"] & { formData(): Promise<FormData> };
}

type ThemeSettingsCaller = ReturnType<typeof createThemeSettingsApiCaller>;

function getBaseUrl(url: URL): string {
  return process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${url.protocol}//${url.host}`;
}

function createThemeCaller(event: LoadEvent): ThemeSettingsCaller | null {
  const orgId = event.locals.orgId ?? process.env["FULCRUM_ORG_ID"];
  const userId = event.locals.userId ?? process.env["FULCRUM_USER_ID"];
  if (!orgId || !userId) return null;

  const cookie = event.request.headers.get("cookie") ?? "";
  return createThemeSettingsApiCaller({
    baseUrl: getBaseUrl(event.url),
    orgId,
    userId,
    fetch: event.fetch,
    headers: cookie ? { cookie } : undefined,
  });
}

export async function load(event: LoadEvent) {
  const { locals } = event;

  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }

  const remote = await createThemeCaller(event)?.theme.get().catch(() => null);
  const settings: ThemeSettings = remote
    ? { ...THEME_DEFAULTS, ...(remote as Partial<ThemeSettings>) }
    : { ...THEME_DEFAULTS };

  return { settings };
}

export const actions = {
  save: async (event: ActionEvent) => {
    const form = await event.request.formData();

    const settings: ThemeSettings = {
      accentHue: Number(form.get("accentHue") ?? THEME_DEFAULTS.accentHue),
      accentSaturation: Number(form.get("accentSaturation") ?? THEME_DEFAULTS.accentSaturation),
      accentLightness: Number(form.get("accentLightness") ?? THEME_DEFAULTS.accentLightness),
      radius: Number(form.get("radius") ?? THEME_DEFAULTS.radius),
      fontFamily: (form.get("fontFamily") as ThemeSettings["fontFamily"]) ?? THEME_DEFAULTS.fontFamily,
      colorScheme: (form.get("colorScheme") as ThemeSettings["colorScheme"]) ?? THEME_DEFAULTS.colorScheme,
      compactMode: form.get("compactMode") === "true",
      animationSpeed: (form.get("animationSpeed") as ThemeSettings["animationSpeed"]) ?? THEME_DEFAULTS.animationSpeed,
      preset: (form.get("preset") as ThemeSettings["preset"]) ?? THEME_DEFAULTS.preset,
    };

    const caller = createThemeCaller(event);
    if (!caller) {
      return fail(503, { saveError: "Theme settings API caller is not configured.", settings });
    }

    try {
      await caller.theme.update(settings as unknown as Record<string, unknown>);
    } catch (error) {
      return fail(400, { saveError: error instanceof Error ? error.message : "Request failed", settings });
    }

    return { saved: true, settings };
  },

  reset: async (event: ActionEvent) => {
    const caller = createThemeCaller(event);
    if (!caller) {
      return fail(503, { saveError: "Theme settings API caller is not configured.", settings: THEME_DEFAULTS });
    }

    try {
      await caller.theme.update(THEME_DEFAULTS as unknown as Record<string, unknown>);
    } catch (error) {
      return fail(400, { saveError: error instanceof Error ? error.message : "Request failed", settings: THEME_DEFAULTS });
    }

    return { saved: true, settings: THEME_DEFAULTS };
  },
};
