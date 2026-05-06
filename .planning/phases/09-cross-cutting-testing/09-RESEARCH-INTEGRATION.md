# Phase 09 Research: Codebase Integration Map

**Researched:** 2026-05-06  
**Scope:** Exact codebase integration points for XCT-01..12 and TST-01..10.

## Existing Assets

### i18n
- `src/i18n/index.ts` — root catalog adapter with `t`, `setLocale`, `dirForLocale`, `formatDate`, `isI18nEnabled`.
- `src/i18n/locales/en.json`, `fr.json`, `ar.json` — current catalogs; `ar` exercises RTL.
- `src/i18n/README.md` — documents adapter-replacement strategy for Paraglide or `svelte-i18n`.
- `src/web/src/routes/api/locale/+server.ts` — web locale endpoint.
- `src/web/tests/vitest/i18n.test.ts`, `src/i18n/i18n.test.ts`, `scripts/i18n-extract.test.ts` — existing i18n tests.
- `tests/tui/i18n-screen.test.ts`, `src/tui/screens/i18n-screen.ts` — TUI i18n surface.

### Theme
- `src/server/trpc/routers/theme.ts` — theme router with `theme.accent`, radius, font, spacing, animation, dark mode.
- `src/web/src/lib/theme.ts`, `src/web/src/lib/useTheme.ts` — web theme cookie/CSS variable path.
- `src/web/src/routes/settings/theme/*` — theme settings route and tests.
- `tests/trpc/theme.test.ts`, `tests/cli/cross-cutting-platform.test.ts`, `tests/tui/theme.test.ts` — existing parity tests.

### Telemetry + Error Reporting
- `src/server/trpc/routers/telemetry.ts` — opt-in, opt-out, status, purge.
- `src/db/entities/platform/TelemetryEvent.ts`, `TelemetryOutbox.ts` — local event/outbox entities.
- `src/platform/remote-telemetry.ts` — HMAC-signed remote batch with retry status.
- `src/orchestration/symphony/telemetry.ts` — optional tracer/no-op structured logging.
- `src/errors/reporter.ts` — local sentry-equivalent outbound report builder/signing/path scrubber.
- `src/server/trpc/routers/error-logs.ts`, `src/db/entities/platform/ErrorLog.ts` — error log API/entity.
- `tests/orchestration/otel-telemetry.test.ts`, `tests/trpc/telemetry.test.ts`, `tests/trpc/errorLogs.test.ts`, `src/errors/reporter.test.ts` — tests.

### Backup, Restore, Import, Export
- `src/server/trpc/routers/backup.ts` — base64 JSON DB dump/restore.
- `src/backup/runner.ts` — currently creates stub `.tar.gz` manifest archive.
- `src/backup/scheduled-task.ts`, `src/backup/scheduled-backups.test.ts`, `src/tui/scheduled-backups.ts` — scheduled backup path.
- `src/server/trpc/routers/json-import-export.ts` — versioned JSON export/import with preflight/run/collisions.
- `src/data/csv-export.ts`, `src/data/csv-import.ts`, `src/data/importers/*` — CSV and external importer paths.
- `src/web/src/routes/settings/backups/*`, `src/web/src/routes/settings/data/*`, `src/web/src/routes/api/data/export-csv/+server.ts`, `import-csv/+server.ts` — web surfaces.
- `src/cli/backup.ts`, `src/cli/generated/backup.ts`, `tests/cli/cross-cutting-platform.test.ts`, `tests/trpc/backup.test.ts`, `tests/trpc/json-import-export.test.ts` — CLI/tests.

### Secrets
- `src/secrets/vault.ts` — `tweetnacl.secretbox` XSalsa20-Poly1305 envelope, PBKDF2-SHA256.
- `src/secrets/keyring.ts` — OS keyring dynamic adapter + fallback file.
- `src/secrets/vault-adapter.ts` — local/Vault/AWS SM provider abstraction behind feature flag.
- `src/secrets/credentials-router.ts` — DB-backed credential tRPC router.
- `src/db/entities/platform/Credential.ts`, `src/db/repositories/platform/CredentialRepository.ts` — persistence.
- `src/web/src/routes/settings/secrets/*`, `tests/secrets/*`, `tests/trpc/credentials.test.ts` — surface/tests.

### Audit Logging
- `src/db/entities/core/Event.ts`, `src/db/repositories/core/EventRepository.ts` — canonical event store.
- `src/server/trpc/routers/audit.ts` — query/export/retention policy router.
- `src/platform/audit-events.ts` — typed cross-cutting event emitter schemas.
- `src/notifications/audit-retention.ts` — retention pruning worker.
- `src/web/src/routes/audit/*`, `src/web/src/routes/audit/export/+server.ts`, `src/tui/screens/audit.ts`, `src/cli/audit.ts` — surfaces.
- `tests/trpc/audit.test.ts`, `tests/notifications/audit-retention.test.ts`, `tests/e2e/notifications-audit-pipeline.test.ts` — tests.

### Testing + Coverage
- `scripts/ci.ts` — local CI gate; add coverage steps here.
- `scripts/test-root.ts` — root test discovery; currently invokes `bun test --conditions=svelte`.
- `bunfig.toml` — currently `[test] coverage = false`.
- `src/web/vitest.config.ts` — web Vitest config; add coverage provider/threshold.
- `src/web/playwright.config.ts` — Playwright webServer and Chromium project.
- `src/web/tests/a11y/*` — axe route sweeps.
- `tests/infrastructure/p1-coverage-matrix.test.ts` — existing coverage planning artifact test.
- `tests/parity/*`, `tests/acceptance/p12-three-surface-parity.test.ts` — prior surface parity gates.

## Event Producer/Consumer Map

| Producer | Events emitted or should emit | Consumers |
|---|---|---|
| i18n locale change | `user_setting.updated` or `i18n.locale.updated` | Audit query/export, telemetry aggregate, Web/TUI settings state. |
| theme setting change | `theme.updated` or `user_setting.updated` | Audit log, Web live theme state, TUI theme screen, telemetry aggregate. |
| telemetry opt-in/out/purge | `telemetry_event.opted_in`, `telemetry_event.opted_out`, `telemetry_event.purged` | Audit router, telemetry status pages, remote telemetry outbox worker. |
| error capture | `error_log.created` | Error log router, settings/errors page, optional remote report worker, audit trail. |
| backup create/restore | `backup.created`, `backup.restored` | Audit router, notification fanout if severe/failure, backup settings page, CLI/TUI status. |
| import/export | `backup.exported`, `backup.imported` or `data.exported/imported` | Audit router, settings/data page, CLI/TUI status, notification fanout on failure. |
| secret set/rotate/delete | `credential.created`, `credential.updated`, `credential.rotated`, `credential.deleted` | Audit router, secrets settings page, doctor secret/keyring checks. |
| migration downgrade/upgrade | `migration.downgraded`, `migration.upgraded`, `migration.verified` | Audit log, doctor/database settings page, CI artifacts. |
| graceful shutdown | `system.shutdown.started`, `system.shutdown.completed`, `workspace.cleanup.completed` | Structured logs, audit if org scoped, doctor/status checks. |

## Interface Parity Map

| Capability | Web | CLI | TUI | API/tRPC |
|---|---|---|---|---|
| i18n locale switch | `/settings/i18n`, locale route | `fulcrum i18n list/set/status --json` | `i18n-screen` | locale/user-setting procedure or existing route |
| theme/custom theme | `/settings/theme` | `fulcrum theme list/get/set --json` | theme settings screen | `themeRouter` |
| telemetry opt-in | `/settings/telemetry` | `fulcrum telemetry status/opt-in/opt-out/purge --json` | telemetry settings/status | `telemetryRouter` |
| error reporting | `/settings/errors` | `fulcrum error-logs list/get/purge --json` | errors/settings screen | `errorLogs` router |
| backup/restore | `/settings/backups` | `fulcrum backup create/restore/status --json` | backup screen | `backupRouter` |
| JSON/CSV import/export | `/settings/data`, API file routes | `fulcrum data export/import/preflight --json` | data/import screen | `json-import-export`, CSV routes |
| secrets | `/settings/secrets` | `fulcrum secrets set/get/rotate/status --json` | secrets/settings screen | `credentialsRouter` |
| audit log | `/audit`, export route | `fulcrum audit query/export/retention --json` | audit screen | `auditRouter` |
| migration downgrade | `/settings/database/migrations` | `fulcrum db migrate down/check --json` | database/settings screen | DB/migrator service |
| graceful shutdown | doctor/status visible | `fulcrum doctor --json`, shutdown smoke | status/settings screen | server lifecycle utilities |
| coverage/testing | test reports in docs/CI output | `bun run ci`, `fulcrum test coverage` if command exists | N/A except TUI tests | CI scripts/test utilities |

## Files That Must Not Break

- `scripts/ci.ts` — final local CI source of truth.
- `scripts/test-root.ts` — root test discovery.
- `bunfig.toml` — Bun test/coverage config.
- `src/web/vitest.config.ts`, `src/web/playwright.config.ts` — web test gates.
- `src/trpc/router.ts` — router mount source of truth.
- `src/trpc/middleware.ts` — permission gate; every new procedure needs explicit permission metadata.
- `src/server/trpc/routers/theme.ts`, `telemetry.ts`, `backup.ts`, `json-import-export.ts`, `audit.ts`, `error-logs.ts` — existing cross-cutting routers.
- `src/secrets/vault.ts`, `src/secrets/keyring.ts`, `src/secrets/vault-adapter.ts` — encryption/keyring invariants.
- `src/db/migrator-service.ts`, `src/db/migrations/*`, `src/db/migration-checksums.ts` — migration integrity/downgrade path.
- `src/web/src/routes/+layout.svelte`, `src/web/src/lib/theme.ts`, `src/web/src/routes/settings/*` — web settings integration.
- `src/tui/index.ts`, `src/tui/screens/*`, `src/tui/testing/fake-tty.ts` — TUI parity/testability.
- `src/cli/index.ts`, `src/cli/generated/*`, `src/cli/local-caller.ts` — CLI command parity.

## Cross-Phase Dependencies

- Phase 1: clean tRPC/service/repository path; no raw SQL expansion.
- Phase 2: graphile-worker registry and permissions infrastructure.
- Phase 5: task/report parity and Phase 5 deep-research standard.
- Phase 6: documents/memory/search and Cmd+K route/test assets.
- Phase 7: notifications/artifacts/repo sync events and audit/fanout paths.
- Phase 8: completed CLI/TUI/Web/API surface delivery; Phase 09 should harden parity instead of rewire surfaces.
- Phase 10: SaaS hardening will depend on Phase 09 audit/telemetry/backup/secrets foundations for org isolation and production operations.

## Data Flow

1. User/admin changes cross-cutting setting in Web/CLI/TUI/API.
2. Surface calls tRPC router with permission metadata.
3. Router validates Zod input/output and calls service/repository or existing helper.
4. Repository persists org/user-scoped setting or domain entity.
5. Mutation emits Event/audit row with typed payload and no secret plaintext.
6. Optional telemetry/error remote workers enqueue signed outbox entries only when feature flag and opt-in allow.
7. Web/TUI/CLI read status from same tRPC routers; tests assert JSON/schema parity.
8. CI runs coverage, a11y, parity, migration downgrade, and graceful shutdown gates before phase completion.

## Planning Implications

- Start with RED coverage/parity/audit tests; Phase 09 is high-risk because many primitives already exist and can regress silently.
- Treat existing `src/backup/runner.ts` stub archive as known gap; backupRouter has real DB dump logic, but runner/archive path still says stub.
- Verify root package includes every direct runtime dependency imported by source. `tweetnacl` is imported by `src/secrets/vault.ts`; planning must confirm package/lock correctness before implementation.
- Do not make new settings pages unless missing; most pages already exist. Prefer wiring/verification.
- Avoid external SaaS dependencies for telemetry/error/coverage. Local-first default remains mandatory.
