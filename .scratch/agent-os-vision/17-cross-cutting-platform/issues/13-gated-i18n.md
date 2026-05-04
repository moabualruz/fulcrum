---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B1, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B1 i18n)
Docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
---

# GATED: i18n — paraglide-js bootstrap, locale picker, RTL CSS, CI extraction gate

## What to build

Behind `FULCRUM_FEATURES=i18n`. Core i18n infrastructure used by Pillar 16 (web) and Pillar 15 (TUI). `@inlang/paraglide-sveltekit` adapter bootstrapped in SvelteKit app. Translation JSON catalog: at minimum `en.json` (all UI strings extracted from Pillar 16 routes) + `ar.json` stub (Arabic, RTL test locale) + `fr.json` stub (French, LTR test locale). `src/i18n/index.ts` exports `t()` helper. RTL support: `dir="rtl"` on `<html>` when locale is Arabic/Hebrew/Persian; Tailwind `rtl:` prefix used for logical margin/padding; `Intl.DateTimeFormat` / `Intl.NumberFormat` locale-aware. CI gate: `bun run i18n:extract` — scans source for `t('key')` calls, compares against `en.json`, fails if any missing or extra keys. Locale selection saved to `tenant_settings(key='web.locale')`.

Failure gate: paraglide-js Svelte plugin breaks on rune update → `svelte-i18n` (MIT) fallback adapter; same CI gate and locale picker behavior.

## Acceptance criteria

- [ ] Flag OFF: no `t()` import resolves differently; no locale picker rendered in settings; `<html>` has no `dir` attribute; `bun run i18n:extract` NOT in CI.
- [ ] Flag ON: `t('common.save')` resolves to English "Save" by default; switch to `ar` → Arabic string (or `[ar]Save` stub); `dir="rtl"` set on `<html>`.
- [ ] CI gate: `bun run i18n:extract` fails if any `t('key')` call has no matching key in `en.json`; fails if `en.json` has orphaned keys not referenced in source.
- [ ] `Intl.DateTimeFormat('ar')`: due dates formatted in Arabic locale format in task list.
- [ ] Locale persists: `tenant_settings(key='web.locale')` written; next SSR honours it.
- [ ] Failure gate: `svelte-i18n` fallback documented in `src/i18n/README.md`; switching adapter requires only changing the export in `src/i18n/index.ts`.
- [ ] Vitest: `t('common.save')` returns string in both `en` and `ar`; RTL locale sets correct dir.

## Blocked by

- Issue 01 (schema) — `tenant_settings` needed to store locale.
