# Locales

The shipped JSON **Catalog** files — one per **SupportedLocale** — that back every `t(key)` lookup in the localization adapter.

## Language

**CatalogFile**:
A `<locale>.json` file in this directory holding the full dotted-key string tree for one **SupportedLocale**.
_Avoid_: locale file, translations.json, messages file

**KeyNamespace**:
A top-level object inside a **CatalogFile** (`common`, `settings`, `tasks`) that groups related **CatalogEntry** values under a shared prefix.
_Avoid_: section, group, bundle

**CatalogEntry**:
A leaf string value at the end of a dotted **TranslationKey** path within a **CatalogFile**.
_Avoid_: message, translation, label

**PlaceholderPrefix**:
The bracketed `[<locale>]` marker prepended to non-`en` **CatalogEntry** values to flag untranslated strings during development.
_Avoid_: stub marker, todo tag, fake translation

## Relationships

- One **SupportedLocale** has exactly one **CatalogFile**; `en.json` is the canonical shape, `ar.json` and `fr.json` mirror its key tree.
- A **CatalogFile** contains one or more **KeyNamespace** objects; every **CatalogEntry** lives under a **KeyNamespace**.
- Non-`en` **CatalogEntry** values carry a **PlaceholderPrefix** until a real translation lands.

## Example dialogue

> **Dev:** "Can `ar.json` add a key that isn't in `en.json`?"
> **Domain expert:** "No — `en.json` defines the **CatalogFile** shape. Every other **CatalogFile** mirrors its **KeyNamespace** and **CatalogEntry** paths exactly, otherwise `t()` returns the key verbatim under that locale."
> **Dev:** "And the `[ar]` prefix?"
> **Domain expert:** "That's the **PlaceholderPrefix** — the **CatalogEntry** is structurally present so lookups resolve, but the string is visibly untranslated."

## Flagged ambiguities

- "namespace" was used for both the top-level **KeyNamespace** object and arbitrary nested sub-objects (e.g. `settings.i18n`) — resolved: only top-level groups are **KeyNamespace**s; deeper nodes are just path segments of a **TranslationKey**.
