/**
 * C1: i18n feature is gated behind FULCRUM_FEATURES=i18n.
 * Default OFF — no locale picker, no dir attribute, English only.
 */

/**
 * Returns true when the i18n feature flag is active.
 * Reads FULCRUM_FEATURES env var (comma-separated list).
 * Safe to call on both server and client (client has no env access → always false unless
 * the flag value is injected via layout data).
 */
export function isI18nEnabled(): boolean {
  // Server-side: process.env
  if (typeof process !== "undefined" && process.env?.FULCRUM_FEATURES) {
    return process.env.FULCRUM_FEATURES.split(",").map((s) => s.trim()).includes("i18n");
  }
  return false;
}

/** Supported locales */
export const SUPPORTED_LOCALES = ["en", "ar"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** RTL locales */
export const RTL_LOCALES: Set<string> = new Set(["ar", "he", "fa"]);

export function isRTL(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

export function isValidLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}
