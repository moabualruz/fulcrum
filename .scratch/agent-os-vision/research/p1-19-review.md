# Codex Cross-Team Review — P1#19 (commit 803f990)

**Reviewing:** `feat(db): MigratorService + SchemaMigration ledger + up/down + lossy-down protection (P1#19)`
**Reviewer:** Codex (gpt-5-codex, medium effort)
**Date:** 2026-05-01

---

## Verdict

- **SPEC: FAIL**
- **QUALITY: CHANGES_REQUIRED**

Core files exist and CI passes, but four spec-critical behaviors are broken or absent: permission gate fail-open, CLI null-container runtime crash, `SchemaMigration` PK serial auto-increment instead of caller-supplied version integer, and lossy-down protection silently fails open on import errors. Tests cover happy paths only — no round-trip, no forced lossy path, no checksum-mismatch coverage.

---

## Per-deliverable table

| Deliverable | Status | Notes |
|---|---|---|
| Scope check | FAIL | Extra issue edit allowed; otherwise paths in scope |
| SchemaMigration entity | FAIL | Serial PK at `src/db/entities/SchemaMigration.ts:37` — breaks version semantics |
| SchemaMigration columns | FAIL | DDL emits varchar, not text, at `Migration20260501140000_schema_migration_ledger.ts:21` |
| SchemaMigration repository | PASS | Injectable repo at `src/db/repositories/SchemaMigrationRepository.ts:14` |
| MigratorService | FAIL | Lossy import-error fail-open at `src/db/migrator-service.ts:55` |
| Ledger writes | PARTIAL | Batch records after migrator at `:116`, `:222` |
| Checksum mismatch | NOT FOUND | Hash tests start at `tests/db/migrator-service.test.ts:217` but no mismatch refusal path |
| migration-checksums.ts | PASS | SHA-256 via crypto.subtle + Bun.file |
| db.router.ts | FAIL | Permission no-op at `:39` — must throw PERMISSION_NOT_AVAILABLE |
| Doctor checks | FAIL | Result uses `message` not `detail` at `src/db/doctor-checks.ts:28` |
| CLI db commands | FAIL | Null container at `src/cli/commands/db.ts:48` → runtime throw at router `:54` |
| Web route | FAIL | Empty load/action at `+page.server.ts:59,77` — stub data unacceptable |
| Tests | FAIL | Lossy suite only target/no-op at `:183` |
| DI binding | PASS | Bindings at `db.module.ts:213` |
| PGlite workaround | PASS | Test-only flags at `:94`; prod config at `mikro-orm.config.ts:150` |

## C6 sweep

CLEAN — no raw SQL outside `src/db/migrations/`.

## Decision flag dispositions

1. **tRPC shim** — ACCEPTABLE (explicit at `src/db/db.router.ts:4`)
2. **assertPermission stub** — **PUSH_BACK** — must throw `PERMISSION_NOT_AVAILABLE` so consumers fail loudly, not silently allow
3. **Doctor aggregator deferral** — ACCEPTABLE
4. **Web stub** — **PUSH_BACK** — must either resolve cross-package import OR throw on access, not return empty data silently
5. **v7 `orm.migrator`** — ACCEPTABLE (correct API)
6. **TUI deferral** — ACCEPTABLE

## Top findings

1. **HIGH** `db.router.ts:39` — permission gate fail-open; any caller passes
2. **HIGH** `cli/commands/db.ts:48` — CLI passes null container; router throws at runtime
3. **HIGH** `entities/SchemaMigration.ts:37` — serial PK breaks version semantics; test at `migrator-service.test.ts:304` codifies the bug
4. **HIGH** `migrator-service.ts:55` — lossy import-error returns `false` → protection can fail open on file corruption
5. **MED** `migrator-service.test.ts:183` — no forced-lossy-down test, no checksum-mismatch test; both spec-mandated

## Required round-2 fixes

1. Replace `SchemaMigration.id` serial PK with `version int PRIMARY KEY` accepting caller-supplied value (computed from migration ordinal or class name hash). Update entity, migration class DDL (varchar→text where applicable), and tests accordingly.
2. `assertPermission()` must throw a typed error (e.g., `class PermissionNotAvailableError extends Error { code = 'PERMISSION_NOT_AVAILABLE' }`) so calls fail loudly until P1#06 lands. Document in router source.
3. CLI: pass real Container instance to router calls; resolve via needle-di entrypoint. Don't pass null.
4. Lossy import-error path: when reading a migration file's `isLossy` static fails (file missing, parse error), THROW with explicit `LossyCheckFailedError` — DO NOT fail-open with `false`. Treat unverifiable as lossy.
5. Add tests:
   - Forced lossy-down path: marks fixture migration `isLossy = true`, run `migrator.down(...)` without `force` → throws; with `force=true` → succeeds AND writes Event row with verb `migration.down-lossy-forced`.
   - Checksum-mismatch path: mock migration file content change after `SchemaMigration` row written; call `MigratorService.migrate(...)` again → throws `migration.checksum-mismatch` error.
   - Round-trip up/down on every migration class (5 classes × 2 directions = 10+ tests).
6. Doctor result shape: use `detail` not `message` per Pillar 14 doctor contract spec (or pick one and document the choice + flag for Pillar 14 alignment).
7. Web `+page.server.ts`: either resolve cross-package import path (use `event.locals.container` once P1#04 wires it) OR throw `INTERNAL_NOT_WIRED_YET` so consumers know it's not silently broken. Document the chosen path.
