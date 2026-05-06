# Phase 09 Research: Platform + UX Patterns

**Researched:** 2026-05-06  
**Scope:** i18n, theming, accessibility, telemetry, error reporting, backup/restore, import/export, secrets, audit logging, graceful shutdown, test coverage across Web, CLI, TUI, and API.

## Summary

Phase 09 should treat cross-cutting features as product-grade system surfaces, not hidden settings. Best-in-class platforms expose these capabilities consistently across UI, automation, and admin/API paths:

- **Settings parity:** Sentry, GitLab, Jira, Notion, and GitHub expose org/project settings through web pages, API endpoints, audit logs, and exportable data. Fulcrum should mirror this through Web settings pages, CLI commands, TUI settings screens, and tRPC/REST-backed APIs where applicable.
- **Observability pattern:** Sentry-style local error events, source/path scrubbing, opt-in remote reporting, release/runtime metadata, and dead-lettered delivery attempts. OpenTelemetry-style traces/metrics should remain optional and non-crashing.
- **Accessibility pattern:** Automated axe checks catch only part of WCAG 2.1 AA. Playwright + `@axe-core/playwright` must cover core routes with WCAG tags, while TUI accessibility needs explicit keyboard, high-contrast, non-color-only state, screen-reader text-mode, and stable focus assertions.
- **Backup/import pattern:** GitLab/Grafana/Notion-style export/import: explicit preflight, manifest version, counts, dry-run/collision policy, redaction of secrets, restore verification. Backup/restore and JSON/CSV import/export must be first-class in Web, CLI, TUI, and API.
- **Audit pattern:** OWASP logging guidance: application-level events, consistent schema, source trust boundaries, integrity, retention, query/export. Fulcrum already has event/audit primitives; Phase 09 should make coverage complete and queryable.
- **Testing pattern:** Coverage gate belongs in local CI. Bun supports built-in coverage thresholds via `bunfig.toml`; Vitest has separate coverage thresholds for web tests. Fulcrum should enforce 80% line coverage with a staged baseline and no external coverage SaaS.

## Competitive Pattern Matrix

| Area | Platform pattern | Fulcrum decision input |
|---|---|---|
| i18n | SvelteKit now commonly pairs with Paraglide/Inlang for SSR-safe, compile-time messages; older store-global approaches create SSR race risk. | Keep current local `src/i18n/index.ts` stable adapter; evaluate `@inlang/paraglide-js@2.18.0` only behind adapter. Do not rewrite every call site first. |
| Theming | shadcn-svelte uses class-based dark mode with `mode-watcher`; product settings usually store theme per user/org. | Keep `mode-watcher@1.1.0`; extend existing theme router and CSS variable settings beyond dark/light. |
| Web a11y | Playwright docs recommend `@axe-core/playwright`; WCAG A/AA tags can scope checks to WCAG 2.1 AA. | Use existing `@axe-core/playwright@4.11.3`; route sweeps must include core flows, not only static pages. |
| TUI a11y | Terminal apps rely on keyboard-only operation, high contrast, reduced animation, focus order, screen-reader/plain-text modes. | Add testable TUI a11y contract: all screens keyboard navigable, color never sole state cue, high-contrast theme, plain text labels for icon/status cells. |
| Telemetry | OpenTelemetry JS traces/metrics are stable; logs still development; browser instrumentation experimental. | Keep local telemetry table as source of truth; add `@opentelemetry/api@1.9.1` only for optional span API, not browser auto-instrumentation. |
| Error reporting | Sentry pattern: source maps/debug metadata, PII scrubbing via before-send hooks, path scrubbing, signed delivery. | Keep Fulcrum local `ErrorLog` + remote feature flag; harden worker delivery, source-map/debug ID metadata, and settings parity. |
| Backup/restore | Admin platforms use manifest, version, dry-run, collisions, redaction, and checksum/restore verification. | Replace stub archive semantics with real DB/org dump manifest; restore must be dry-run capable and produce counts. |
| Import/export | Notion/GitLab-style import/export uses explicit format versions and collision choices. | Current `fulcrum.json-export.v1` and CSV paths become canonical. Add parity surfaces and secret redaction tests. |
| Secrets | 1Password/Vault/GitHub Secrets pattern: encrypted local storage, external provider adapter, never display plaintext by default, rotation/audit events. | Keep local Nacl/PBKDF2 path; verify provider fallback; expose set/rotate/test/status across all interfaces. |
| Audit logging | OWASP recommends app-level logs with consistent schema, retention, trust boundary awareness, and injection safety. | Use Event table + audit router as canonical audit trail; every cross-cutting mutation must emit audit event and be queryable/exportable. |
| Migration downgrade | ORM migration tools support `down`; mature apps test rollback with fixtures and explain limitations. | Require every new Phase 09 migration to implement/test `down`; create downgrade smoke from latest to previous and back. |
| Coverage | Bun coverage thresholds can fail test run; Vitest has separate V8/Istanbul coverage thresholds. | Root CI adds Bun coverage with 0.80 line threshold; web Vitest adds `@vitest/coverage-v8@4.1.5` and thresholds. |

## Exact UX Patterns To Carry Into Context

- Web settings pages remain canonical human UX: `/settings/i18n`, `/settings/theme`, `/settings/telemetry`, `/settings/errors`, `/settings/backups`, `/settings/data`, `/settings/secrets`, `/audit`, `/settings/database/migrations`.
- CLI parity uses existing generated/domain commands where present: `fulcrum theme`, `fulcrum telemetry`, `fulcrum backup`, `fulcrum audit`, `fulcrum secrets`, plus add/verify `fulcrum i18n`, `fulcrum data export/import`, `fulcrum migrations downgrade/check`, `fulcrum test coverage`.
- TUI parity uses existing settings screens: `i18n-screen`, `theme`, `settings-screens`, `audit`, backups, notifications/audit. No TUI business logic or direct DB imports.
- API parity means tRPC procedures for every cross-cutting capability; REST exposure only where existing public API pattern already exists or import/export/download needs file endpoints.
- Audit log UX matches Sentry/GitLab admin search: filters by actor, org/project, action, subject kind, date range; export JSON/CSV; retention policy visible.
- Backup/import UX has three explicit states: preflight, run, verify. Destructive restore requires preview/dry-run and counts before mutation.
- Accessibility UX: no icon-only controls without accessible names; no color-only status; keyboard focus visible; all dialogs/menus close with Escape; TUI has high-contrast + plain text state labels.

## Sources

- Paraglide JS SvelteKit docs: https://inlang.com/m/dxnzrydw/paraglide-sveltekit-i18n/manual-setup
- shadcn-svelte dark mode docs: https://svelte-4.shadcn-svelte.com/docs/dark-mode/svelte
- OpenTelemetry JavaScript docs: https://opentelemetry.io/docs/languages/js/
- Playwright accessibility testing docs: https://playwright.dev/docs/next/accessibility-testing
- Bun coverage docs: https://bun.sh/docs/test/coverage
- Vitest coverage config docs: https://main.vitest.dev/config/coverage
- MikroORM migrations docs: https://mikro-orm.github.io/docs/v3/migrations/
- Sentry JavaScript data scrubbing docs: https://docs.sentry.io/platforms/javascript/configuration/environments/
- Sentry source maps help: https://sentry.zendesk.com/hc/en-us/articles/20925013464731-How-does-Sentry-use-source-maps
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
