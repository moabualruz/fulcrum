---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 17-cross-cutting-platform/issues/13-gated-i18n.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q-cross-cut, C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (i18n gated)
Docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
---

# GATED: i18n — paraglide-js, locale selector, RTL CSS flips, Intl formatting

## What to build

Behind `FULCRUM_FEATURES=i18n`. Integrates `paraglide-js` (ParaglideJS) into the SvelteKit app via `@inlang/paraglide-sveltekit` adapter. Locale selection UI in `Settings → i18n` (language picker combobox, saved to `tenant_settings(key='web.locale')`). RTL CSS flips: when locale is Arabic/Hebrew/Persian → `dir="rtl"` on `<html>` + logical CSS properties (`padding-inline-start` etc.) via Tailwind `rtl:` prefix. Date/number locale formatting via `Intl.DateTimeFormat` / `Intl.NumberFormat`. CI gate: `bun run i18n:extract` must produce 0 untranslated keys before merge (run in CI lint stage).

Flag OFF: no locale picker in settings; all strings hardcoded English; no `dir` attribute change; `bun run i18n:extract` not in CI.

## Acceptance criteria

- [ ] Flag OFF: settings shows no locale section; `<html>` has no `dir` attribute; English strings rendered normally.
- [ ] Flag ON: locale picker at `/settings/i18n`; select `ar` (Arabic) → `dir="rtl"` on `<html>`; sidebar flips to right side; padding/margin logical.
- [ ] `Intl.DateTimeFormat`: task due dates formatted per locale (e.g. `ar` → Arabic numerals or Gregorian with Arabic format).
- [ ] Translation JSON: at minimum `en.json` + `ar.json` stub with 5 keys showing extraction works; CI `bun run i18n:extract` reports 0 untranslated.
- [ ] `tenant_settings(key='web.locale')` persisted; next page load honours locale without re-selecting.
- [ ] Failure gate: paraglide-js Svelte plugin breaks → `svelte-i18n` fallback adapter; same locale picker behavior.

## Blocked by

- Issue 01 (scaffold) — SvelteKit app must exist.
- Pillar 17 issue 13 (i18n gated) — paraglide-js bootstrap + CI gate.
