---
phase: 02-bug-fixes-foundation
plan: 06
subsystem: database
tags:
  - tenant-settings
  - migrations
  - mikro-orm
  - feature-flags
  - pglite
dependency_graph:
  requires:
    - "02-02 database backend migration command"
  provides:
    - "TenantSetting MikroORM entity and repository"
    - "org-first tenant-scoped product-kernel indexes"
    - "canonical env feature flag bridge used by TUI"
    - "explicit PGlite migration verification"
  affects:
    - database
    - product-kernel
    - tui
    - feature-flags
tech_stack:
  added: []
  patterns:
    - "org-scoped repository methods"
    - "canonical env flag parsing bridge"
    - "product-kernel migration SQL keeps org_id first in tenant indexes"
key_files:
  created:
    - src/db/entities/TenantSetting.ts
    - src/db/repositories/TenantSettingRepository.ts
    - tests/db/tenant-setting-entity.test.ts
  modified:
    - src/db/mikro-orm.config.ts
    - src/db/db.module.ts
    - src/product-kernel/tenant-settings.test.ts
    - src/product-kernel/db/migrations/0004_tenant_settings.sql
    - src/product-kernel/db/migrations/0004_sprints_and_metrics.sql
    - src/flags/registry.ts
    - src/tui/feature-flags.ts
    - tests/db/migrations/composite-indexes.test.ts
    - tests/flags/registry.test.ts
    - src/tui/feature-flags.test.ts
decisions:
  - "Tenant settings use a standalone MikroORM entity keyed by orgId and key instead of piggybacking on product-kernel raw SQL."
  - "Product-kernel tenant indexes keep org_id as the leading column for tenant-scoped access paths."
  - "TUI feature flags use the canonical registry and shared env parsing instead of a divergent local list."
requirements_completed:
  - FND-01
  - FND-03
  - FND-06
  - FND-07
metrics:
  duration: "~20m"
  completed: "2026-05-04"
---

# Phase 02 Plan 06: DB Foundation and Feature Flags Summary

Tenant settings now have a MikroORM-backed repository, product-kernel tenant lookups use org-first indexes, and TUI feature flags resolve through the canonical registry.

## Work Completed

- Added RED coverage for tenant settings schema, MikroORM entity registration, product-kernel composite indexes, and canonical env feature flag parsing.
- Added `TenantSetting` and `TenantSettingRepository`, registered both in MikroORM and DI.
- Updated product-kernel tenant-settings and metrics-cache migrations so tenant-scoped access paths lead with `org_id`.
- Bridged TUI feature flag parsing/enabling to the canonical registry and added the TUI flag names to `FEATURE_FLAGS`.
- Verified PGlite migration command output with `db migrate --backend pglite --json`.

## Task Commits

| Task | Commit | Result |
| --- | --- | --- |
| 1 RED foundation tests | `18233c10` | Added failing tests for missing entity, env bridge, and composite indexes |
| 2 Tenant settings entity/repo | `f14a21a4` | Added entity, repository, DI/MikroORM wiring, tenant settings migration, metrics index |
| 3 Feature flags + indexes | `3705f887` | Added canonical env bridge and TUI adapter; fixed PGlite test teardown |
| 4 Migration verification | `5c067266` | Recorded successful PGlite migration verification |
| Auto-fix | `3a28b5eb` | Replaced unsupported MikroORM persistence call |

## Verification

- PASS: `bun test src/product-kernel/tenant-settings.test.ts tests/db/tenant-setting-entity.test.ts tests/db/migrations/composite-indexes.test.ts tests/flags/registry.test.ts src/tui/feature-flags.test.ts` (80 pass).
- PASS: `bun run src/index.ts db migrate --backend pglite --json` returned `{"backend":"pglite","applied":[],"pending":[],"current":"0008_saved_views_compat.sql","ok":true}`.
- PASS: `bun run --bun tsc --noEmit`.
- SKIPPED: PostgreSQL migration verification because `DATABASE_URL` was not set.
- FAIL, out of scope: `bun run ci` exits 1 in the broad test stage: 3641 pass, 2 skip, 250 fail, 1 error. Failures match pre-existing ARCH-02 raw ProductDb/EntityManager migration blockers plus baseline generated-code, completion, CLI ledger, and sprint migration drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unsupported TenantSetting repository persistence**
- **Found during:** Plan-level typecheck.
- **Issue:** `EntityManager.persistAndFlush` is not available on this MikroORM EntityManager type.
- **Fix:** Switched to `persist(setting)` followed by `flush()`.
- **Files modified:** `src/db/repositories/TenantSettingRepository.ts`
- **Commit:** `3a28b5eb`

**2. [Rule 3 - Blocking] Closed leaked PGlite test handle**
- **Found during:** Task 3 verification.
- **Issue:** Composite-index assertions passed, but Bun exited 99 because the PGlite handle remained open.
- **Fix:** Added `afterAll` teardown to close the PGlite instance.
- **Files modified:** `tests/db/migrations/composite-indexes.test.ts`
- **Commit:** `3705f887`

### Notes

- The plan expected the product-kernel `tenant_settings` id-column test to fail during RED. It already passed because an existing migration file had introduced the `id` column. The rest of RED failed as expected and drove implementation.

## Known Stubs

None.

## Threat Flags

None. New DB/flag surfaces were planned by the threat model and mitigated with org-first indexes plus canonical flag parsing.

## Deferred Issues

- Broad `bun run ci` remains blocked by pre-existing ARCH-02 raw `ProductDb` callers passing non-MikroORM handles into store helpers that now require `EntityManager`.
- Broad CI also reports existing generated-code snapshot drift, shell-completion drift, auth root-entrypoint failures, migration-ledger status mismatch, and sprint migration `updated_at` drift. These failures are outside Plan 02-06 changed files and were not fixed here.

## Self-Check: PASSED

- Summary file exists.
- Task commits `18233c10`, `f14a21a4`, `3705f887`, `5c067266`, and `3a28b5eb` exist in git history.
- No tracked file deletions were found in the task commit range.
