# Phase 9: Cross-Cutting + Testing - Context

**Gathered:** 2026-05-06  
**Status:** Ready for planning  
**Research basis:** Deep platform, dependency, and codebase integration research persisted in `09-RESEARCH-PLATFORMS.md`, `09-RESEARCH-DEPENDENCIES.md`, and `09-RESEARCH-INTEGRATION.md`.

<domain>
## Phase Boundary

Phase 09 delivers product-wide operational quality after Phase 08 surface delivery: i18n, custom themes, accessibility, telemetry, local error reporting, backup/restore, import/export, secret encryption, audit logging, migration downgrade, graceful shutdown, and comprehensive test coverage. Scope is hardening and completing existing cross-cutting primitives with maximum practical parity across Web, CLI, TUI, and API/tRPC. Scope is not a new product pillar, hosted SaaS operations, or replacement of existing surface architecture.

</domain>

<decisions>
## Implementation Decisions

### Deep Research Standard
- **D-01:** Phase 09 planning must follow Phase 5/8 research rigor: platform UX research, dependency/library research, and codebase integration map must be read before implementation decisions.
- **D-02:** Downstream planners must name exact packages, exact platform UX patterns, exact interaction behavior, and exact file paths. Generic "add telemetry", "improve accessibility", or "increase tests" tasks are insufficient.
- **D-03:** Research artifacts are canonical and disk-backed: `.planning/phases/09-cross-cutting-testing/09-RESEARCH-PLATFORMS.md`, `09-RESEARCH-DEPENDENCIES.md`, and `09-RESEARCH-INTEGRATION.md`.

### Maximum Interface Parity
- **D-04:** Every Phase 09 cross-cutting feature needs an explicit parity row across Web, CLI, TUI, and API/tRPC where applicable. Required rows: i18n, theme, telemetry, error logs, backup/restore, JSON/CSV import/export, secrets, audit logs, migration downgrade/status, graceful shutdown/status, coverage/test gates.
- **D-05:** Parity is capability-equivalent, not identical UI. Web is primary settings/admin UX; CLI is scriptable JSON/status/action UX; TUI is keyboard operational/settings UX; API/tRPC is shared contract and automation path.
- **D-06:** No interface may own business logic. Web/CLI/TUI/REST call tRPC/service/repository paths; direct DB/entity imports from surfaces are bugs unless isolated test utilities already do so.
- **D-07:** Every CLI command added or hardened in this phase must support `--json` and return schema-shaped data. Human text output is secondary.

### i18n + Locale UX
- **D-08:** Keep `src/i18n/index.ts` as stable adapter boundary with `t`, `setLocale`, `dirForLocale`, `formatDate`, and `isI18nEnabled`. Do not scatter direct dependency calls across app code.
- **D-09:** Default locale remains `en`; additional locales must include `fr` and `ar`, with `ar` used to verify RTL direction behavior.
- **D-10:** Evaluate `@inlang/paraglide-js@2.18.0` only behind the adapter. It may replace adapter internals if tests prove SvelteKit SSR safety, extraction, locale switching, and no route regressions.
- **D-11:** Locale switching must exist in Web settings, CLI status/set commands, TUI i18n screen, and API/tRPC or existing locale route. Persisted selection must survive reload.

### Custom Theme UX
- **D-12:** Keep `mode-watcher@1.1.0` and existing shadcn-svelte/Tailwind class strategy. Do not add a new theme package.
- **D-13:** Theme customization extends existing `themeRouter` keys: accent, radius, font family, spacing unit, animation duration, dark-mode. Planner can add constrained keys only if tests and UI validate values.
- **D-14:** Theme values must be sanitized before CSS injection. Preserve `SAFE_VAR`/`SAFE_VALUE` style protections in `src/web/src/lib/theme.ts`.
- **D-15:** Theme parity: Web settings editor, CLI list/get/set, TUI theme screen, tRPC tests. API output returns key/value/defaultValue.

### Accessibility
- **D-16:** Web accessibility target is WCAG 2.1 AA on core flows with `@axe-core/playwright@4.11.3`, Playwright WCAG tags, and manual assertions for keyboard/focus/name/contrast gaps automated axe cannot fully prove.
- **D-17:** Core Web flows include the Phase 8 WEB-07 journeys plus cross-cutting settings: i18n, theme, telemetry, errors, backups, data import/export, secrets, audit, database migrations.
- **D-18:** TUI accessibility means keyboard-only navigation on all screens, visible focus, high-contrast theme, non-color-only state labels, screen-reader/plain-text mode where feasible, and tests through `FakeTTY`.
- **D-19:** Accessibility failures block phase completion. Do not bury known violations as TODOs unless user explicitly approves deferral.

### Telemetry + Error Reporting
- **D-20:** Local telemetry table is source of truth. Telemetry is opt-in only; remote telemetry remains feature-flagged and signed. No outbound network call when opt-in or remote flag is off.
- **D-21:** OpenTelemetry is optional. Add `@opentelemetry/api@1.9.1` only if planner needs vendor-neutral spans; avoid required `@opentelemetry/sdk-node@0.216.0` default dependency.
- **D-22:** Error reporting is local sentry-equivalent: `ErrorLog` rows, scrubbed paths, no PII, optional HMAC-signed remote worker. Do not adopt `@sentry/*` SDK as core dependency.
- **D-23:** Error/telemetry settings need Web, CLI, TUI, and tRPC parity, including status, opt-in/out, purge, list, and worker delivery status where implemented.

### Backup, Restore, Import, Export
- **D-24:** Backup/restore UX uses preflight, run, verify. Restore must support dry-run/preview before mutation and report entity counts.
- **D-25:** Backup format must be versioned and manifest-based. Planner should converge `backupRouter` DB dump semantics and `src/backup/runner.ts` archive path; current runner stub is a known gap.
- **D-26:** Import/export keeps existing `fulcrum.json-export.v1` and CSV paths. Secrets must be redacted; credentials must never export plaintext.
- **D-27:** Parity surfaces: Web settings pages and file endpoints, CLI backup/data commands, TUI backup/data screens, tRPC routers. Large export can return job IDs.

### Secrets
- **D-28:** Keep current local vault scheme for v1: `tweetnacl.secretbox` XSalsa20-Poly1305 envelope, 24-byte nonce, PBKDF2-SHA256 100k iterations, 32-byte key, OS keyring with fallback file mode `0600`.
- **D-29:** Phase 09 must verify encryption-at-rest for API keys, webhook secrets, connector tokens, provider credentials, and any telemetry/error remote signing secrets.
- **D-30:** Secret UX must expose set, rotate, delete/archive, provider status, and doctor checks without displaying plaintext by default. Every secret mutation emits audit event without secret value.
- **D-31:** Vault/AWS Secrets Manager provider path remains feature-flagged via `vault-integration`; local provider is default.

### Audit Logging
- **D-32:** Event table + `auditRouter` is canonical audit trail. Every Phase 09 mutation emits typed audit event: i18n/theme changes, telemetry opt-in/out/purge, error log purge, backup/restore, import/export, secret set/rotate/delete, migration downgrade, shutdown cleanup.
- **D-33:** Audit log UX follows OWASP/Sentry/GitLab-style admin search: filter by actor, org/project, subject kind, verb, date range; export JSON/CSV; retention policy visible and testable.
- **D-34:** Audit payload schemas must never include plaintext secrets, tokens, passwords, or raw file contents. Tests must assert redaction.

### Migration Downgrade + Graceful Shutdown
- **D-35:** Every new Phase 09 migration must implement and test `down`. Add downgrade smoke: migrate up to latest, downgrade one step or to previous marker, migrate up again, verify checksums/schema.
- **D-36:** Migration downgrade strategy is documented in code/tests, not only prose. Use MikroORM migrator APIs where possible.
- **D-37:** Graceful shutdown must cover PGlite integrity, server close, graphile-worker/in-flight job handling, EventBus/subscriptions shutdown, orphaned workspace cleanup, and idempotent repeated signals.
- **D-38:** Shutdown behavior must be observable through structured logs and doctor/status checks; it must not depend on remote telemetry.

### Comprehensive Testing
- **D-39:** Coverage threshold target is 80% line coverage minimum per TST-08. Implement staged gating if current baseline is below 80%, but final Phase 09 completion cannot claim TST-08 without hard gate.
- **D-40:** Root coverage uses Bun built-in coverage via `bunfig.toml`/`bun test --coverage`; web coverage uses `@vitest/coverage-v8@4.1.5` with Vitest thresholds.
- **D-41:** `scripts/ci.ts` remains local CI source of truth. Add coverage, a11y, migration downgrade, parity, and graceful shutdown gates there or through called scripts.
- **D-42:** Test inventory must cover TST-01..10: infrastructure, tRPC all routers, 14 Playwright journeys, all TUI screens, all 15 CLI domains, inference contracts, Symphony conformance, coverage threshold, gate regression tests, and RED->GREEN evidence from prior phases.
- **D-43:** Phase 09 should not re-run implementation of previous features; it adds missing tests and fixes gaps found by those tests.

### the agent's Discretion
- Exact plan wave split is planner discretion, but research and parity matrix must come before implementation tasks.
- Exact names for new CLI subcommands are flexible if they follow existing command registry conventions and support `--json`.
- Exact coverage ramp mechanism is planner discretion, but final gate must enforce 80% line coverage.
- Exact audit event verb names can be adjusted to existing Event schema, provided every mutation is covered and documented.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 09 Research
- `.planning/phases/09-cross-cutting-testing/09-RESEARCH-PLATFORMS.md` — competitive platform UX patterns for cross-cutting systems.
- `.planning/phases/09-cross-cutting-testing/09-RESEARCH-DEPENDENCIES.md` — exact package decisions and dependency adoption/avoidance.
- `.planning/phases/09-cross-cutting-testing/09-RESEARCH-INTEGRATION.md` — codebase integration map, event producer/consumer map, files that must not break.

### Requirements
- `.planning/ROADMAP.md` §Phase 9 — scope, success criteria, dependencies.
- `.planning/REQUIREMENTS.md` §Cross-Cutting (XCT-01..12) — cross-cutting requirements.
- `.planning/REQUIREMENTS.md` §Testing (TST-01..10) — coverage and test requirements.
- `.planning/PROJECT.md` — local-first and three-surface product constraints.

### Prior Phase Decisions
- `.planning/phases/05-task-management-metrics/05-CONTEXT.md` — Phase 5 deep-research standard and parity expectations.
- `.planning/phases/06-documents-memory-search/06-CONTEXT.md` — docs/memory/search/Cmd+K parity and deterministic search decisions.
- `.planning/phases/07-repos-artifacts-notifications/07-CONTEXT.md` — notifications/artifacts/repos event and parity decisions.
- `.planning/phases/08-surface-delivery/08-CONTEXT.md` — maximum surface parity contract and exact interface expectations.

### Codebase Starting Points
- `src/i18n/index.ts` — root i18n adapter.
- `src/i18n/README.md` — adapter replacement strategy.
- `scripts/i18n-extract.ts` — i18n extraction gate.
- `src/server/trpc/routers/theme.ts` — theme settings router.
- `src/web/src/lib/theme.ts` — web CSS variable sanitization/cookie path.
- `src/server/trpc/routers/telemetry.ts` — telemetry opt-in/status/purge router.
- `src/platform/remote-telemetry.ts` — remote telemetry outbox/signing.
- `src/errors/reporter.ts` — local sentry-equivalent error reporting.
- `src/server/trpc/routers/error-logs.ts` — error log router.
- `src/server/trpc/routers/backup.ts` — backup/restore tRPC router.
- `src/backup/runner.ts` — backup archive runner with current stub gap.
- `src/server/trpc/routers/json-import-export.ts` — JSON import/export preflight/run path.
- `src/data/csv-export.ts` and `src/data/csv-import.ts` — CSV data path.
- `src/secrets/vault.ts` — encryption scheme.
- `src/secrets/keyring.ts` — keyring/fallback behavior.
- `src/secrets/vault-adapter.ts` — external secret provider feature gate.
- `src/server/trpc/routers/audit.ts` — audit query/export/retention router.
- `src/platform/audit-events.ts` — typed audit payload schemas.
- `src/db/migrator-service.ts` — migration runner integration.
- `scripts/ci.ts` — local CI source of truth.
- `scripts/test-root.ts` — root test discovery.
- `bunfig.toml` — Bun test/coverage configuration.
- `src/web/vitest.config.ts` — web unit/coverage config.
- `src/web/playwright.config.ts` — Playwright e2e/a11y server config.
- `src/web/tests/a11y/` — existing web a11y tests.
- `src/tui/testing/fake-tty.ts` — TUI accessibility/parity test harness.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/i18n/index.ts`: stable adapter already supports `en`, `fr`, `ar`, RTL direction, date formatting, and feature flag gating.
- `src/server/trpc/routers/theme.ts`: existing theme schema/defaults/router can be extended rather than replaced.
- `src/server/trpc/routers/telemetry.ts`: opt-in/status/purge path already exists but persistence of opt-in may need hardening.
- `src/platform/remote-telemetry.ts`: signed remote batch path already implements opt-in-compatible outbox semantics.
- `src/errors/reporter.ts`: path scrubbing and HMAC signing already exist for error reports.
- `src/server/trpc/routers/backup.ts`: real DB dump/restore semantics exist; `src/backup/runner.ts` archive remains stub.
- `src/server/trpc/routers/json-import-export.ts`: format-versioned import/export path exists with preflight/collisions.
- `src/secrets/vault.ts` and `src/secrets/keyring.ts`: encryption/key management primitives already exist.
- `src/server/trpc/routers/audit.ts`: query/export/retention policy router already exists.
- `src/web/tests/a11y/`, `src/web/tests/e2e/`, `tests/tui/`, `tests/cli/`, `tests/trpc/`: broad test inventory exists and should be expanded.

### Established Patterns
- Web/CLI/TUI converge on tRPC/service/repository paths.
- MikroORM is canonical data path; no product-kernel/raw SQL expansion.
- Zod schemas validate tRPC inputs/outputs.
- Feature flags follow `FULCRUM_FEATURES` build-always, gate-on behavior.
- Root tests use `bun:test`; web uses Vitest/Playwright; TUI uses FakeTTY.
- Local-first means no required hosted telemetry/error/coverage service.

### Integration Points
- Web settings routes call tRPC routers and server actions; update existing settings pages instead of creating parallel admin surfaces.
- CLI generated commands and hand-written commands call local tRPC caller and must return JSON.
- TUI settings/screens call `TuiCaller` and stay headless-testable.
- Audit event emission should sit in router/service mutation paths, not only UI handlers.
- CI additions belong in `scripts/ci.ts` and sub-scripts so `bun run ci` remains the final gate.

</code_context>

<specifics>
## Specific Ideas

- Copy Sentry's operational feel for local errors: issue list, stack/path scrub, runtime metadata, purge, optional signed remote delivery.
- Copy GitLab/Sentry audit admin UX: filterable table, export, retention, actor/action/subject/date filters.
- Copy Notion/GitLab import/export UX: preflight, dry run, collision policy, manifest counts, verification.
- Use Playwright + axe route sweeps for automated a11y, then add manual-style keyboard/focus tests for gaps.
- Use Bun/Vitest built-in coverage instead of external coverage SaaS.
- Keep Phase 8 maximum parity discipline: every cross-cutting feature gets Web/CLI/TUI/API row and tests.

</specifics>

<deferred>
## Deferred Ideas

- Hosted Sentry/Datadog/OTel collector integration as required default — out of scope for local-first v1.
- New enterprise theme marketplace or visual theme builder — future enhancement beyond custom theme support.
- Full l10n of every documentation page and generated artifact — Phase 09 should cover UI/framework and representative catalogs first.
- External SIEM export beyond JSON/CSV audit export — v2/enterprise hardening.
- Replacing current encryption scheme with Argon2/native libs — not needed unless tests find current scheme defective.

</deferred>

---

*Phase: 9-Cross-Cutting + Testing*  
*Context gathered: 2026-05-06*
