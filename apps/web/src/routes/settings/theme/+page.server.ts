/**
 * Settings → Theme page server.
 *
 * Pillar 16: web shell rebuild — theme customisation UI.
 * Stores per-org theme settings via tRPC theme.* procedures.
 * Falls back to defaults when no settings persisted yet.
 */

import { fail, redirect } from "@sveltejs/kit";
import { THEME_DEFAULTS, type ThemeSettings } from "./theme";

interface RouteLocals {
  session: unknown;
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

// ── tRPC helpers ──────────────────────────────────────────────────────────────

function getBaseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

async function trpcGet(
  fetchFn: typeof fetch,
  origin: string,
  procedure: string,
  cookie: string,
): Promise<unknown> {
  const res = await fetchFn(`${origin}/api/trpc/${procedure}?input=%7B%7D`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json", cookie },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const d = (body as { result?: { data?: { json?: unknown } } })?.result?.data;
  if (d !== undefined && "json" in (d as object)) return (d as { json: unknown }).json;
  return d ?? null;
}

async function trpcPost(
  fetchFn: typeof fetch,
  origin: string,
  procedure: string,
  input: unknown,
  cookie: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchFn(`${origin}/api/trpc/${procedure}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg =
      (body as { error?: { json?: { message?: string } } })?.error?.json?.message ?? "Request failed";
    return { ok: false, error: msg };
  }
  return { ok: true };
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function load(event: LoadEvent) {
  const { locals, fetch: fetchFn, request, url } = event;

  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }

  const cookie = request.headers.get("cookie") ?? "";
  const origin = getBaseUrl(url);

  const remote = await trpcGet(fetchFn, origin, "theme.get", cookie);
  const settings: ThemeSettings = remote
    ? { ...THEME_DEFAULTS, ...(remote as Partial<ThemeSettings>) }
    : { ...THEME_DEFAULTS };

  return { settings };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export const actions = {
  /**
   * save — persist theme settings.
   */
  save: async (event: ActionEvent) => {
    const { fetch: fetchFn, request, url } = event;
    const origin = getBaseUrl(url);
    const cookie = request.headers.get("cookie") ?? "";
    const form = await request.formData();

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

    const result = await trpcPost(fetchFn, origin, "theme.update", settings, cookie);
    if (!result.ok) {
      return fail(400, { saveError: result.error, settings });
    }

    return { saved: true, settings };
  },

  /**
   * reset — restore defaults.
   */
  reset: async (event: ActionEvent) => {
    const { fetch: fetchFn, request, url } = event;
    const origin = getBaseUrl(url);
    const cookie = request.headers.get("cookie") ?? "";

    const result = await trpcPost(fetchFn, origin, "theme.update", THEME_DEFAULTS, cookie);
    if (!result.ok) {
      return fail(400, { saveError: result.error, settings: THEME_DEFAULTS });
    }

    return { saved: true, settings: THEME_DEFAULTS };
  },
};
