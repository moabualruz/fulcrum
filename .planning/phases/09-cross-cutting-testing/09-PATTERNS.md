# Phase 09: Cross-Cutting + Testing - Patterns

**Mapped:** 2026-05-06

## Pattern Map

| Work Area | New/Modified Files | Closest Existing Analogs | Pattern To Copy |
|---|---|---|---|
| Cross-cutting parity matrix | `src/platform/cross-cutting-parity.ts`, `tests/platform/cross-cutting-parity.test.ts` | `src/surfaces/parity.ts`, `src/surfaces/parity.test.ts` | Explicit required capability inventory and tests that fail on missing surface cells. |
| i18n | `src/i18n/index.ts`, locales, web/tui/cli tests | `src/i18n/i18n.test.ts`, `src/web/tests/vitest/i18n.test.ts`, `tests/tui/i18n-screen.test.ts` | Stable adapter, feature flag, catalog shape, RTL test with `ar`. |
| Theme | `src/server/trpc/routers/theme.ts`, `src/web/src/lib/theme.ts` | `tests/trpc/theme.test.ts`, `src/web/src/routes/settings/theme/page.server.test.ts` | Zod input/output, sanitized CSS variables, settings route test. |
| Web accessibility | `src/web/tests/a11y/*.test.ts` | `src/web/tests/a11y/phase08-routes.test.ts`, `icon-button-sweep.test.ts` | Playwright + axe route helper plus explicit accessible-name assertions. |
| TUI accessibility | `src/tui/screens/*`, `tests/tui/*.test.ts` | `src/tui/testing/fake-tty.ts`, `tests/tui/theme.test.ts`, `tests/tui/settings-screens.test.ts` | FakeTTY plain-text assertions, keyboard paths, non-color-only labels. |
| Telemetry | `src/server/trpc/routers/telemetry.ts`, `src/platform/remote-telemetry.ts` | `tests/trpc/telemetry.test.ts`, `src/platform/remote-telemetry.test.ts` | Opt-in store, scrubbed payloads, signed outbox, no network when off. |
| Errors | `src/errors/reporter.ts`, `src/server/trpc/routers/error-logs.ts` | `src/errors/reporter.test.ts`, `tests/trpc/errorLogs.test.ts` | PII/path scrubbing, signed delivery job, local ErrorLog source. |
| Backup/import | `src/server/trpc/routers/backup.ts`, `src/backup/runner.ts`, `json-import-export.ts` | `tests/trpc/backup.test.ts`, `tests/trpc/json-import-export.test.ts` | Versioned format, entity counts, preflight/collision/dry-run. |
| Secrets | `src/secrets/vault.ts`, `src/secrets/keyring.ts`, `src/secrets/credentials-router.ts` | `tests/secrets/vault.test.ts`, `tests/secrets/keyring.test.ts`, `tests/trpc/credentials.test.ts` | Local Nacl envelope, keyring fallback, no plaintext export. |
| Audit | `src/server/trpc/routers/audit.ts`, `src/platform/audit-events.ts` | `tests/trpc/audit.test.ts`, `tests/notifications/audit-retention.test.ts` | Event-backed query/export/retention and typed payload schemas. |
| Migration/shutdown | `src/db/migrator-service.ts`, server lifecycle files | `tests/db/migrator-service.test.ts`, `tests/orchestration/stall.test.ts`, `tests/workers/registry.test.ts` | Executable smoke tests, explicit state transition assertions. |
| Coverage/CI | `bunfig.toml`, `scripts/ci.ts`, `src/web/vitest.config.ts` | `scripts/ci.test.ts`, `scripts/test-root.ts`, `src/web/vitest.config.ts` | Local CI runner stages and deterministic thresholds. |

## Must Preserve

- `scripts/ci.ts` remains final local CI source of truth.
- `src/i18n/index.ts` remains stable adapter boundary.
- `src/web/src/lib/theme.ts` CSS variable sanitization stays in place.
- `src/secrets/vault.ts` scheme remains compatible with existing encrypted values.
- `src/trpc/middleware.ts` permission metadata remains required for new procedures.
- `src/tui/testing/fake-tty.ts` stays the non-interactive TUI test harness.

## PATTERN MAPPING COMPLETE
