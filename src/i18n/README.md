# i18n adapter

Fulcrum routes all UI string lookup through `src/i18n/index.ts`.

Current adapter is a small local catalog wrapper shaped so paraglide-js can replace only `index.ts` exports once SvelteKit rune compatibility is stable. If paraglide-js blocks upgrades, switch `index.ts` to a `svelte-i18n` adapter and keep these exports stable:

- `t(key, locale?)`
- `setLocale(locale)`
- `dirForLocale(locale)`
- `formatDate(value, locale?)`
- `isI18nEnabled(features?)`
