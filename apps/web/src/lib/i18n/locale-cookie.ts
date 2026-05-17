/**
 * Locale persistence via cookies.
 * tenant_settings(key='web.locale') persisted via cookie until DB integration is wired.
 */

import type { Cookies } from "@sveltejs/kit";
import { isValidLocale, type SupportedLocale } from "./feature-flag.js";

export const LOCALE_COOKIE = "fulcrum_locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function getLocaleFromCookie(cookies: Cookies): SupportedLocale {
  const raw = cookies.get(LOCALE_COOKIE);
  if (raw && isValidLocale(raw)) return raw;
  return "en";
}

export function setLocaleCookie(cookies: Cookies, locale: SupportedLocale): void {
  cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: COOKIE_MAX_AGE,
  });
}
