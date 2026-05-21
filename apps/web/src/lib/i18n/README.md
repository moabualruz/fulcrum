# i18n: Fulcrum internationalisation

## Adapter

Current: plain JSON catalog with `t()` function (no runtime dependency).

### Switching to paraglide-js

1. `bun add @inlang/paraglide-sveltekit`
2. Replace the body of `src/lib/i18n/index.ts` with paraglide exports.
3. Keep the same `t(key)` signature: all consumers import from `$lib/i18n`.
4. CI gate (`i18n:extract`) continues to work unchanged.

### Fallback: svelte-i18n

If paraglide-js breaks on a Svelte rune update:

1. `bun add svelte-i18n`
2. Replace `index.ts` exports with svelte-i18n's `$t` store, re-exported as `t`.
3. Same locale picker, same CI gate, same RTL logic.

## Feature flag

Set `FULCRUM_FEATURES=i18n` to enable. When off, `t()` still resolves (returns English) but locale picker is not rendered and `<html>` has no `dir` attribute.

## RTL

`dir="rtl"` set on `<html>` when locale is `ar`, `he`, or `fa`. Tailwind `rtl:` prefix available for logical margin/padding.

## Locale persistence

Saved via `TenantSettingRepository.upsertValue(orgId, 'web.locale', locale)`. SSR reads it on next load.
