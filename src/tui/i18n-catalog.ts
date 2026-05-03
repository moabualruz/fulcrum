/**
 * Minimal paraglide-js-compatible message catalog for TUI labels.
 *
 * WHY: Real paraglide generates a full catalog from .po/.json files.
 * For now we ship the keys we test against; adding more keys is additive.
 *
 * Keys used in acceptance criteria (3 translated strings for "fr"):
 *   - "settings.title"
 *   - "search.placeholder"
 *   - "nav.projects"
 */

export type LocaleCode = string;

export const SUPPORTED_LOCALES: LocaleCode[] = [
  "en",
  "fr",
  "de",
  "es",
  "ar",
  "ja",
  "zh",
];

type MessageMap = Record<string, string>;
type Catalog = Record<LocaleCode, MessageMap>;

const catalog: Catalog = {
  en: {
    "settings.title": "Settings",
    "search.placeholder": "Search…",
    "nav.projects": "Projects",
    "nav.tasks": "Tasks",
    "nav.settings": "Settings",
    "i18n.screen_title": "Language & Region",
    "i18n.select_locale": "Select locale",
    "feature.disabled": "Feature disabled",
  },
  fr: {
    "settings.title": "Paramètres",
    "search.placeholder": "Rechercher…",
    "nav.projects": "Projets",
    "nav.tasks": "Tâches",
    "nav.settings": "Paramètres",
    "i18n.screen_title": "Langue et région",
    "i18n.select_locale": "Choisir la langue",
    "feature.disabled": "Fonctionnalité désactivée",
  },
  de: {
    "settings.title": "Einstellungen",
    "search.placeholder": "Suchen…",
    "nav.projects": "Projekte",
    "nav.tasks": "Aufgaben",
    "nav.settings": "Einstellungen",
    "i18n.screen_title": "Sprache & Region",
    "i18n.select_locale": "Sprache wählen",
    "feature.disabled": "Funktion deaktiviert",
  },
  es: {
    "settings.title": "Configuración",
    "search.placeholder": "Buscar…",
    "nav.projects": "Proyectos",
    "nav.tasks": "Tareas",
    "nav.settings": "Configuración",
    "i18n.screen_title": "Idioma y región",
    "i18n.select_locale": "Seleccionar idioma",
    "feature.disabled": "Función desactivada",
  },
};

/** Resolve a message key for the given locale, falling back to "en". */
export function t(key: string, locale: LocaleCode): string {
  const messages: MessageMap = catalog[locale] ?? catalog["en"] ?? {};
  const en: MessageMap = catalog["en"] ?? {};
  return messages[key] ?? en[key] ?? key;
}

/** Return all messages for a locale (merged with "en" defaults). */
export function messagesFor(locale: LocaleCode): MessageMap {
  return { ...(catalog["en"] ?? {}), ...(catalog[locale] ?? {}) };
}
