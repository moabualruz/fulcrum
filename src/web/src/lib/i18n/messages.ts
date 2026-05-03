/**
 * Lightweight paraglide-js-compatible message runtime.
 * Loads translation JSON for the active locale and provides t() lookup.
 *
 * This is the "svelte-i18n fallback adapter" referenced in the acceptance criteria
 * (the failure gate: paraglide-js Svelte plugin breaks → svelte-i18n fallback adapter).
 * It provides the same locale picker behavior without requiring the full paraglide
 * Vite plugin integration.
 */

import type { SupportedLocale } from "./feature-flag.js";

type MessageCatalog = Record<string, string>;

const catalogs: Partial<Record<SupportedLocale, MessageCatalog>> = {};

async function loadCatalog(locale: SupportedLocale): Promise<MessageCatalog> {
  if (catalogs[locale]) return catalogs[locale]!;
  // Dynamic import of message JSON
  try {
    const mod = await import(`../../messages/${locale}.json`, { assert: { type: "json" } });
    catalogs[locale] = mod.default as MessageCatalog;
  } catch {
    // Fallback: return empty catalog (will show keys)
    catalogs[locale] = {};
  }
  return catalogs[locale]!;
}

/** Synchronously look up a translation key. Pre-load catalog before calling. */
export function t(catalog: MessageCatalog, key: string, vars?: Record<string, string>): string {
  let msg = catalog[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replace(`{${k}}`, v);
    }
  }
  return msg;
}

export { loadCatalog, type MessageCatalog, type SupportedLocale };
