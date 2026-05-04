---
phase: 02-bug-fixes-foundation
plan: 02
subsystem: database
tags: [pglite, postgres, mikro-orm, migrations, bun-compile]
requires:
  - phase: 01-arch-convergence
    provides: [service-layer, mikro-orm-boundaries, event-dispatcher]
provides:
  - compiled Fulcrum binary DB startup with PGlite default
  - deterministic database backend resolution
  - explicit `fulcrum db migrate --backend ...` command surface
  - repaired DDL cleanup migration
affects: [cli, database, migrations, product-kernel]
tech-stack:
  added: []
  patterns:
    - resolver-owned DB backend precedence
    - explicit migration before product commands
    - PGlite data under Fulcrum home
key-files:
  created:
    - src/config/database.ts
  modified:
    - src/cli/commands/db.ts
    - src/cli/index.ts
    - src/cli/product.ts
    - src/db/mikro-orm.config.ts
    - src/product-kernel/db/pglite.ts
    - src/db/migrations/Migration20260504120000_telemetry_outbox.ts
    - src/db/migrations/Migration20260504130000_ddl_cleanup.ts
    - tests/cli/build.test.ts
    - tests/db/mikro-orm-config.test.ts
    - tests/db/migrator-service.test.ts
key-decisions:
  - "Database backend precedence is CLI flag, persisted config, DATABASE_URL, then PGlite default."
  - "Product init no longer auto-runs migrations; users must run fulcrum db migrate explicitly."
  - "PGlite default data lives under FULCRUM_HOME and is created recursively before opening."
patterns-established:
  - "Use resolveDatabaseConfig() for all CLI and ORM database backend selection."
  - "Use openDatabase() for product-kernel DB handles instead of hardcoding PGlite or Postgres."
requirements-completed: [BUG-01, FND-01]
duration: 18min
completed: 2026-05-04
---

# Phase 02 Plan 02: DB Backend and Migration Summary

**Compiled Fulcrum binaries now start against writable PGlite by default, PostgreSQL remains selectable, and migrations run through an explicit DB command.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-04T11:03:00Z
- **Completed:** 2026-05-04T11:21:18Z
- **Tasks:** 4
- **Files modified:** 12

## Accomplishments

- Added `resolveDatabaseConfig()` with deterministic backend precedence and a writable PGlite default under `FULCRUM_HOME`.
- Routed compiled binary DB startup through the same backend resolver and removed the compiled-binary PGlite blocker.
- Added explicit `fulcrum db migrate --backend pglite|postgres --json` support.
- Repaired `Migration20260504130000_ddl_cleanup` so fresh PGlite/Postgres schemas can apply it.

## Task Commits

1. **Task 1: RED backend and migration tests** - `c4b84b41` (test)
2. **Task 2: Backend resolver and CLI migration command** - `fe9e9c7b` (feat)
3. **Task 3: DDL cleanup migration repair** - `5d2629aa` (fix)
4. **Task 4: Recursive PGlite data directory creation** - `fa82563c` (fix)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `src/config/database.ts` - Central resolver for backend type, URL, and PGlite data directory.
- `src/cli/commands/db.ts` - Explicit DB migrate/status command handling with JSON output.
- `src/cli/index.ts` - Lazy DB container construction and compiled binary `db status --json` path.
- `src/cli/product.ts` - Product commands use resolved DB config and require explicit migration.
- `src/db/mikro-orm.config.ts` - ORM config follows the shared resolver.
- `src/product-kernel/db/pglite.ts` - PGlite opens in compiled binaries and creates nested data dirs.
- `src/db/migrations/Migration20260504120000_telemetry_outbox.ts` - Marked destructive down as lossy.
- `src/db/migrations/Migration20260504130000_ddl_cleanup.ts` - Fixed UUID default, legacy column guards, and lossy marker.
- `tests/cli/build.test.ts` - Compiled binary DB status coverage.
- `tests/db/mikro-orm-config.test.ts` - Resolver precedence coverage.
- `tests/db/migrator-service.test.ts` - Explicit backend migration and lossy migration coverage.

## Decisions Made

- CLI `--backend` has highest precedence because explicit operator intent must override config and environment.
- `DATABASE_URL` selects PostgreSQL only when no persisted backend or CLI backend is present.
- Product CLI commands fail with a clear migration message instead of silently running migrations during `product init`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed DDL cleanup UUID default and fresh-schema assumptions**
- **Found during:** Task 3
- **Issue:** `Migration20260504130000_ddl_cleanup` set a UUID column default to `gen_random_uuid()::text` and referenced legacy `source_doc_id` / `target_doc_id` columns on fresh schemas.
- **Fix:** Changed the UUID default to `gen_random_uuid()` and guarded legacy column alterations with `information_schema.columns`.
- **Files modified:** `src/db/migrations/Migration20260504130000_ddl_cleanup.ts`, `src/db/migrations/.snapshot-postgres.json`
- **Verification:** `bun run src/index.ts db migrate --backend pglite --json`; targeted DB suite.
- **Committed in:** `5d2629aa`

**2. [Rule 2 - Missing Critical] Marked destructive migration downs as lossy**
- **Found during:** Task 3
- **Issue:** Existing migration lossiness tests caught destructive `down()` bodies without `static readonly isLossy = true`.
- **Fix:** Added lossy markers to telemetry outbox and DDL cleanup migrations.
- **Files modified:** `src/db/migrations/Migration20260504120000_telemetry_outbox.ts`, `src/db/migrations/Migration20260504130000_ddl_cleanup.ts`
- **Verification:** `bun test tests/db/migrator-service.test.ts`
- **Committed in:** `5d2629aa`

**3. [Rule 1 - Bug] Created nested PGlite data directories before opening**
- **Found during:** Overall CI verification
- **Issue:** Doctor tests opened PGlite at nested Fulcrum state paths whose parents did not exist.
- **Fix:** `openPglite()` now runs `mkdir(dataDir, { recursive: true })` before constructing PGlite.
- **Files modified:** `src/product-kernel/db/pglite.ts`
- **Verification:** Targeted DB/compiled suite still passes; doctor ENOENT changed to expected schema-not-migrated failures.
- **Committed in:** `fa82563c`

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 2)
**Impact on plan:** All fixes were within DB/migration scope and required for correctness.

## Verification

- `bun test tests/cli/build.test.ts tests/db/mikro-orm-config.test.ts tests/db/migrator-service.test.ts src/product-kernel/db/migrate.test.ts` - passed, 55 tests.
- `bun run src/index.ts db migrate --backend pglite --json` - passed with `{"backend":"pglite","applied":[],"pending":[],"current":"0008_saved_views_compat.sql","ok":true}`.
- `bun run src/index.ts db status --json` - passed with default PGlite backend JSON.
- PostgreSQL explicit migration smoke was skipped because `DATABASE_URL` was not set.
- `bun run ci` - failed outside this plan scope in existing ARCH-02 raw `ProductDb` test paths and product/doctor tests that still assume `product init` auto-migrates schemas.

## Deferred Issues

- Full CI still contains many existing tests that pass raw `ProductDb` into repository helpers requiring a MikroORM `EntityManager`; representative files include `src/product-kernel/symphony.test.ts`, `src/product-kernel/git-write-ops.test.ts`, `src/product-kernel/webhook.test.ts`, and `src/cli/product.test.ts`.
- `src/cli/doctor.test.ts` has product-kernel tests that still assume `product init` creates migrated schema rows. This plan intentionally moved migrations to `fulcrum db migrate`.

## Known Stubs

None.

## Threat Flags

None. New DB backend selection and writable PGlite path were planned threat-model surfaces.

## User Setup Required

None for PGlite default. PostgreSQL override requires `DATABASE_URL` or `fulcrum db migrate --backend postgres --url <postgres-url>`.

## Next Phase Readiness

Compiled binary DB startup and explicit migration command coverage are ready for downstream Phase 2 plans. Remaining broad CI failures should be handled by the planned repository/test migration work, not by this DB backend plan.

## Self-Check: PASSED

- Summary file exists.
- Task commits found: `c4b84b41`, `fe9e9c7b`, `5d2629aa`, `fa82563c`.

---
*Phase: 02-bug-fixes-foundation*
*Completed: 2026-05-04*
