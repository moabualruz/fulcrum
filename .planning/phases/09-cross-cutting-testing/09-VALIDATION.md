# Phase 09: Cross-Cutting + Testing - Validation Strategy

**Created:** 2026-05-06

## Validation Architecture

Phase 09 passes only when cross-cutting behavior is parity-tested, data-safe, accessible, and enforced by local CI coverage gates.

## Dimensions

1. **Parity:** `src/platform/cross-cutting-parity.ts` lists every XCT capability and required Web/CLI/TUI/API cells.
2. **i18n/theme:** Web, CLI, TUI, and tRPC tests cover locale/theme read/write/persist/render.
3. **Accessibility:** Web Playwright axe checks cover WCAG 2.1 AA route flows; TUI tests cover keyboard/high contrast/non-color-only output.
4. **Observability:** Telemetry and errors are local-first, opt-in, PII-safe, signed when remote, and audit-logged.
5. **Data safety:** Backup/restore/import/export support manifest versioning, preflight, dry-run, collision policy, secret redaction, verification counts.
6. **Secrets/audit:** All secret kinds are encrypted at rest and every mutation emits typed audit events without plaintext.
7. **Migration/shutdown:** Downgrade and shutdown smoke tests are executable and included in CI.
8. **Coverage:** Root and web line coverage thresholds enforce 80% minimum at final gate.

## Required Commands

- `bun test tests/platform/cross-cutting-parity.test.ts`
- `bun test src/i18n/i18n.test.ts tests/trpc/theme.test.ts tests/trpc/telemetry.test.ts tests/trpc/errorLogs.test.ts`
- `bun test tests/trpc/backup.test.ts tests/trpc/json-import-export.test.ts tests/trpc/audit.test.ts tests/trpc/credentials.test.ts`
- `bun test tests/secrets/vault.test.ts tests/secrets/keyring.test.ts tests/secrets/vault-adapter.test.ts`
- `bun test tests/db/migrator-service.test.ts tests/platform/graceful-shutdown.test.ts`
- `cd src/web && bun run web:a11y`
- `cd src/web && bun run web:test -- --coverage`
- `bun test --coverage`
- `bun run ci`

## Acceptance

- All XCT-01..12 and TST-01..10 IDs appear in at least one plan frontmatter.
- `bunfig.toml` contains coverage enabled or CI invokes `bun test --coverage`.
- `src/web/vitest.config.ts` contains a coverage threshold configuration.
- `09-UAT.md` records PASS/FAIL evidence for every XCT and TST requirement.
