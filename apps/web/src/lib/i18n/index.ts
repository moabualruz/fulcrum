/**
 * Gated i18n module — active only when FULCRUM_FEATURES includes "i18n".
 *
 * Adapter: plain JSON catalog (svelte-i18n-compatible API surface).
 * Switching to paraglide-js or svelte-i18n requires only changing exports
 * from this file — all consumers import { t, locale, ... } from "$lib/i18n".
 *
 * Fallback adapter note: if paraglide-js breaks on a Svelte rune update,
 * swap the catalog loader here. The t() signature and CI gate remain the same.
 * See services/platform-core/src/application/localization/README.md for migration guide.
 */

import enCatalog from "./locales/en.json";
import arCatalog from "./locales/ar.json";
import frCatalog from "./locales/fr.json";

export type SupportedLocale = "en" | "ar" | "fr";

export const RTL_LOCALES: ReadonlySet<string> = new Set(["ar", "he", "fa"]);

const catalogs: Record<SupportedLocale, Record<string, string>> = {
  en: enCatalog,
  ar: arCatalog,
  fr: frCatalog,
};

let currentLocale: SupportedLocale = "en";

/**
 * Set the active locale. Returns the dir attribute value for <html>.
 */
export function setLocale(loc: SupportedLocale): "rtl" | "ltr" {
  currentLocale = loc;
  return getDir(loc);
}

/** Current locale getter. */
export function getLocale(): SupportedLocale {
  return currentLocale;
}

/** Determine text direction for a locale. */
export function getDir(loc: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(loc) ? "rtl" : "ltr";
}

/**
 * Translate a key using the current locale catalog.
 * Falls back to English if key missing in target locale.
 * Returns the key itself (bracketed) if missing everywhere.
 */
export function t(key: string): string {
  const catalog = catalogs[currentLocale];
  if (catalog && key in catalog) return catalog[key];
  // fallback to en
  if (currentLocale !== "en" && key in catalogs.en) return catalogs.en[key];
  return `[${currentLocale}]${key}`;
}

/**
 * Format a date using Intl.DateTimeFormat for the current locale.
 */
export function formatDate(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(currentLocale, options).format(date);
}

/**
 * Format a number using Intl.NumberFormat for the current locale.
 */
export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(currentLocale, options).format(num);
}

/** Check if the i18n feature flag is enabled. */
export function isI18nEnabled(): boolean {
  const features = (typeof process !== "undefined"
    ? process.env.FULCRUM_FEATURES
    : undefined) ?? "";
  return features.split(",").map((f) => f.trim()).includes("i18n");
}

/** All keys in the English catalog — used by CI extraction gate. */
export function getEnglishKeys(): string[] {
  return Object.keys(catalogs.en).sort();
}

/** All supported locales. */
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en", "ar", "fr"];

export function isValidLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function setLocaleCookie(
  cookies: { set: (name: string, value: string, options?: Record<string, unknown>) => void },
  locale: SupportedLocale,
): void {
  cookies.set("fulcrum_locale", locale, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Alias used by layout.server.ts — returns dir attribute for a locale. */
export function dirForLocale(locale: string, enabled: boolean): "rtl" | "ltr" | undefined {
  if (!enabled) return undefined;
  return getDir(locale);
}

/** Normalize a locale string to a supported locale, defaulting to "en". */
export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (SUPPORTED_LOCALES.includes(trimmed as SupportedLocale)) return trimmed as SupportedLocale;
  return "en";
}
