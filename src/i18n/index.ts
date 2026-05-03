import en from "./locales/en.json" with { type: "json" };
import ar from "./locales/ar.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };

export const SUPPORTED_LOCALES = ["en", "ar", "fr"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type TextDirection = "ltr" | "rtl";

const catalogs: Record<SupportedLocale, unknown> = { en, ar, fr };
const rtlLocales = new Set(["ar", "he", "fa", "ur"]);

let currentLocale: SupportedLocale = "en";

export function isI18nEnabled(features = process.env["FULCRUM_FEATURES"] ?? ""): boolean {
  return features
    .split(",")
    .map((feature) => feature.trim().split(":")[0]?.toLowerCase())
    .includes("i18n");
}

export function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  const normalized = (locale ?? "").trim().toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(normalized) ? normalized as SupportedLocale : "en";
}

export function setLocale(locale: string): void {
  currentLocale = normalizeLocale(locale);
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function dirForLocale(locale: string, enabled = isI18nEnabled()): TextDirection | null {
  if (!enabled) return null;
  return rtlLocales.has(normalizeLocale(locale)) ? "rtl" : "ltr";
}

export function t(key: string, locale = currentLocale): string {
  const catalog = catalogs[normalizeLocale(locale)];
  const value = key.split(".").reduce<unknown>((node, part) => {
    if (!node || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[part];
  }, catalog);
  return typeof value === "string" ? value : key;
}

export function formatDate(value: string | null | undefined, locale = currentLocale): string {
  if (!value) return t("tasks.noDueDate", locale);
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
