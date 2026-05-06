# Phase 09 Research: Dependencies

**Researched:** 2026-05-06  
**Goal:** Minimize custom code, preserve local-first defaults, and avoid replacing existing cross-cutting primitives that already exist.

## Current Dependencies To Reuse

| Capability | Existing package/code | Decision |
|---|---|---|
| Web a11y | `@axe-core/playwright@4.11.3`, `@playwright/test@1.59.1` | Reuse. Expand route/core-flow coverage and WCAG 2.1 AA tags. |
| Web theming | `mode-watcher@1.1.0`, shadcn-svelte/Bits UI, Tailwind CSS 4 | Reuse. Extend existing CSS variable + cookie path. |
| Web tests | `vitest@4.1.5`, `happy-dom@20.9.0`, SvelteKit 2.59 | Reuse. Add coverage package only. |
| Root tests | `bun:test`, `bunfig.toml`, `scripts/test-root.ts`, `scripts/ci.ts` | Reuse. Add coverage threshold gate to existing local CI. |
| i18n adapter | `src/i18n/index.ts`, `src/i18n/locales/en.json`, `fr.json`, `ar.json`, `scripts/i18n-extract.ts` | Reuse. Keep stable adapter exports. |
| Error reporting | `src/errors/reporter.ts`, `src/db/entities/platform/ErrorLog.ts`, `errorLogs` router | Reuse. Complete worker/UI/API parity. |
| Telemetry | `TelemetryEvent`, `TelemetryOutbox`, `telemetryRouter`, `src/platform/remote-telemetry.ts` | Reuse. Optional OpenTelemetry API only if needed. |
| Backup/import | `backupRouter`, `json-import-export` router, `src/data/csv-*`, settings routes | Reuse. Harden manifest/checksum/dry-run/verification. |
| Secrets | `src/secrets/vault.ts`, `keyring.ts`, `vault-adapter.ts`, `Credential` entity | Reuse. Verify encryption, fallback, rotation, provider status. |
| Audit | Event entity, `auditRouter`, `src/platform/audit-events.ts`, `src/notifications/audit-retention.ts` | Reuse. Expand event coverage and retention/export tests. |

## Candidate Dependency Matrix

| Package | Current version checked | Use | Decision |
|---|---:|---|---|
| `@inlang/paraglide-js` | `2.18.0` | Compile-time i18n for SvelteKit. | Evaluate only behind `src/i18n/index.ts` adapter. Do not direct-import generated APIs across app in Phase 09 unless adapter spike passes. |
| `@opentelemetry/api` | `1.9.1` | Stable trace/metric API facade. | Add only if tracing needs vendor-neutral span API outside Symphony telemetry. Keep optional/no-op when not installed or no endpoint. |
| `@opentelemetry/sdk-node` | `0.216.0` | Node SDK/exporters. | Avoid as required dependency in Phase 09; too heavy for local-first default. Use optional dynamic import if planner proves need. |
| `@vitest/coverage-v8` | `4.1.5` | Web Vitest coverage provider. | Add to `src/web/devDependencies`; set web thresholds after baseline. |
| `axe-core` | `4.11.4` | Core accessibility engine. | Already transitive via `@axe-core/playwright`; add direct only if route scanner needs direct API. |
| `@axe-core/playwright` | `4.11.3` | Playwright axe integration. | Already installed in root/web; keep exact package. |
| `tweetnacl` | `1.0.3` | Existing local secretbox implementation. | Ensure root dependency exists if import currently relies on transitive lock. Keep; do not switch crypto scheme in this phase. |
| `svelte-i18n` | current ecosystem alternative | Runtime store i18n. | Do not adopt first; SSR/global store risk and existing adapter already covers simple catalogs. Fallback only if Paraglide cannot fit. |
| `@sentry/sveltekit` / `@sentry/node` | current Sentry SDKs | Hosted/self-hosted error reporting SDK. | Do not adopt for core. Fulcrum requirement is local sentry-equivalent; remote feature remains HMAC POST to user endpoint. |

## Dependency Decisions

- **D-DEP-01:** No new platform rewrite dependencies. Cross-cutting code should extend existing routers/entities/settings pages.
- **D-DEP-02:** i18n stays adapter-first. `@inlang/paraglide-js@2.18.0` can replace adapter internals only after tests prove SvelteKit SSR, route locale switching, and extraction.
- **D-DEP-03:** Theming stays `mode-watcher@1.1.0` + CSS custom properties. No new theming package.
- **D-DEP-04:** Accessibility stays Playwright + `@axe-core/playwright@4.11.3`; add manual/test assertions for WCAG items axe cannot detect.
- **D-DEP-05:** Coverage uses built-in Bun coverage for root and `@vitest/coverage-v8@4.1.5` for web Vitest. No Codecov/Coveralls/GitHub Actions dependency.
- **D-DEP-06:** OpenTelemetry is optional. Add `@opentelemetry/api@1.9.1` only if needed for API-level spans; avoid `@opentelemetry/sdk-node@0.216.0` as default dependency.
- **D-DEP-07:** Keep `tweetnacl@1.0.3` + PBKDF2-SHA256 local vault scheme for v1. Verify and document scheme; changing encryption algorithm is out of scope unless tests expose breakage.
- **D-DEP-08:** Do not adopt Sentry SDKs for core error reporting. Existing local ErrorLog + optional signed remote endpoint matches local-first requirement.

## Source Notes

- Bun supports `coverageThreshold` in `bunfig.toml`; setting threshold causes non-zero exit below threshold.
- Vitest thresholds are percentages when positive; web coverage must be configured separately from root Bun coverage.
- OpenTelemetry JS docs mark traces and metrics stable, logs development; browser instrumentation experimental. This argues against browser auto-instrumentation.
- Playwright docs explicitly use `@axe-core/playwright` and WCAG tags for WCAG 2.1 AA checks.
- MikroORM supports `down` migrations through migrator APIs; Phase 09 should add downgrade tests rather than ad hoc SQL rollback scripts.

## Sources

- Bun coverage docs: https://bun.sh/docs/test/coverage
- Bun test config docs: https://bun.com/docs/test/configuration
- Vitest coverage config: https://main.vitest.dev/config/coverage
- Playwright accessibility docs: https://playwright.dev/docs/next/accessibility-testing
- OpenTelemetry JS docs: https://opentelemetry.io/docs/languages/js/
- MikroORM migrations docs: https://mikro-orm.github.io/docs/v3/migrations/
- Paraglide JS SvelteKit docs: https://inlang.com/m/dxnzrydw/paraglide-sveltekit-i18n/manual-setup
- shadcn-svelte dark mode docs: https://svelte-4.shadcn-svelte.com/docs/dark-mode/svelte
