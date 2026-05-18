/**
 * TUI Settings → i18n screen.
 *
 * WHY: C1 / Q-flag-granularity — i18n feature gated behind
 * FULCRUM_FEATURES=i18n.  When OFF: screen route hidden; nav attempt renders
 * "Feature disabled" banner.  When ON: locale list rendered; Enter selects →
 * stored via SettingsService → TUI labels re-render from paraglide catalog.
 */

import { isEnabled } from "@feature-flags/interface/feature-flags.ts";
import { t, SUPPORTED_LOCALES } from "../i18n-catalog.ts";
import type { SettingsService } from "../types.ts";

export const SETTINGS_KEY_LOCALE = "locale";

export interface I18nScreenResult {
  /** Whether the screen is actually visible (flag is ON). */
  visible: boolean;
  /** Banner text when flag is OFF. */
  banner?: string;
  /** List of available locale codes (only populated when visible). */
  locales?: string[];
  /** The current selected locale (only populated when visible). */
  currentLocale?: string;
}

export interface I18nScreenOptions {
  settings: SettingsService;
  env?: Record<string, string | undefined>;
}

/** Render the i18n screen (read-only view — returns state for rendering). */
export async function renderI18nScreen(
  opts: I18nScreenOptions,
): Promise<I18nScreenResult> {
  if (!isEnabled("i18n", opts.env)) {
    return {
      visible: false,
      banner: "Feature disabled",
    };
  }

  const currentLocale = (await opts.settings.get(SETTINGS_KEY_LOCALE)) ?? "en";

  return {
    visible: true,
    locales: SUPPORTED_LOCALES,
    currentLocale,
  };
}

/**
 * Handle locale selection (Enter key on a locale list item).
 * Stores the locale via SettingsService and returns the updated label set for
 * the chosen locale so the TUI can re-render all labels.
 */
export async function selectLocale(
  locale: string,
  opts: I18nScreenOptions,
): Promise<{ locale: string; labels: Record<string, string> }> {
  if (!isEnabled("i18n", opts.env)) {
    throw new Error("Feature disabled");
  }
  await opts.settings.set(SETTINGS_KEY_LOCALE, locale);

  // Return the three acceptance-criteria labels plus full catalog.
  const labels: Record<string, string> = {
    "settings.title": t("settings.title", locale),
    "search.placeholder": t("search.placeholder", locale),
    "nav.projects": t("nav.projects", locale),
    "nav.tasks": t("nav.tasks", locale),
    "nav.settings": t("nav.settings", locale),
    "i18n.screen_title": t("i18n.screen_title", locale),
    "i18n.select_locale": t("i18n.select_locale", locale),
  };

  return { locale, labels };
}

/**
 * Returns whether the i18n tab should appear in the Settings navigator.
 * Called by the nav renderer to conditionally show/hide the tab.
 */
export function i18nTabVisible(
  env?: Record<string, string | undefined>,
): boolean {
  return isEnabled("i18n", env);
}
