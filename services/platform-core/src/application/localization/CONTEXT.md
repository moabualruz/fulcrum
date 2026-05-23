# Localization

The i18n adapter for Fulcrum UI string lookup: a stable export surface (`t`, `setLocale`, `dirForLocale`, `formatDate`, `isI18nEnabled`) over local JSON catalogs, shaped so paraglide-js or `svelte-i18n` can replace the implementation without changing call sites.

## Language

**SupportedLocale**:
A locale code in the closed set `en | ar | fr` backed by a shipped JSON catalog.
_Avoid_: language, lang tag, BCP-47 code

**Catalog**:
A JSON file under `locales/<locale>.json` holding the dotted-key string tree resolved by `t(key)`.
_Avoid_: translation file, messages, dictionary, resource bundle

**TranslationKey**:
A dotted path (e.g. `settings.i18n.title`) traversed against a **Catalog** to produce a translated string; missing paths return the key itself.
_Avoid_: message id, i18n token, lookup string

**TextDirection**:
The `ltr | rtl` writing direction resolved from a locale, returned only when the `i18n` feature flag is enabled.
_Avoid_: rtl mode, dir attr, layout direction

**I18nFeatureFlag**:
The `i18n` entry inside `FULCRUM_FEATURES` that gates direction resolution and adapter-visible behavior.
_Avoid_: i18n toggle, locale switch, rtl flag

**LocaleState**:
The module-scoped current **SupportedLocale** read by `getLocale()` and mutated by `setLocale()`.
_Avoid_: active language, session locale, global locale

## Relationships

- A **SupportedLocale** has exactly one **Catalog** loaded at import time.
- A **TranslationKey** resolves against the **Catalog** of the requested or current **SupportedLocale**; unresolved keys return the key string verbatim.
- `dirForLocale` returns a **TextDirection** only when the **I18nFeatureFlag** is set; otherwise it returns `null`.
- `setLocale` and `getLocale` read/write the single **LocaleState**; `t` and `formatDate` default their `locale` argument to it.
- `formatDate` is a **TranslationKey**-aware date renderer: it falls back to `tasks.noDueDate` when the input is empty.

## Example dialogue

> **Dev:** "If I call `t('settings.unknown.title')` under `ar`, what comes back?"
> **Domain expert:** "The **TranslationKey** itself — `settings.unknown.title`. The **Catalog** lookup returns the key verbatim when the dotted path misses, so missing strings are visible in the UI, not blank."
> **Dev:** "And `dirForLocale('ar')` without the flag?"
> **Domain expert:** "`null`. **TextDirection** is only produced when the **I18nFeatureFlag** is on; otherwise the caller leaves `dir` unset."

## Flagged ambiguities

- "locale" was used for both the **SupportedLocale** union and arbitrary BCP-47 input strings — resolved: callers pass strings; `normalizeLocale` coerces to a **SupportedLocale**, defaulting unknown values to `en`.
- "catalog" vs "translation" — resolved: a **Catalog** is the whole JSON file for one **SupportedLocale**; an individual entry is addressed by its **TranslationKey**, never called a "translation".
