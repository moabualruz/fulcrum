# Codex Re-Review — P1#19 round-2 (commit 0f22e54)

**Reviewing:** `fix(db): P1#19 round-2 — version PK + lossy-fail-closed + permission-typed-error + CLI container + tests`
**Reviewer:** Codex (gpt-5-codex, medium effort)
**Date:** 2026-05-01

---

## Verdict

- **SPEC: FAIL** (Suite 10 missing 6th migration class)
- **QUALITY: CHANGES_REQUIRED** (4 quality issues — checksum-skip silent failure + 3 hygiene)

All 4 HIGH + most MED fixed cleanly. SPEC fail is narrow: round-trip Suite 10 hard-codes 5 migration classes but the repo now has 6 (P1#02 round-4 split events backfill into 20537+20538). Spec mandates "every migration class".

---

## Per-fix verification

| # | Status | Notes |
|---|---|---|
| HIGH 1 | PASS | bigint PK + autoincrement:false, DDL fixed, version extracted |
| HIGH 2 | PASS (with caveat) | Lossy fail-closed; new error classes; pre-flight checksum validation. **Caveat**: checksum-skip on unreadable file at `migrator-service.ts:350-353` silently continues — could mask file deletion + re-apply attacks |
| HIGH 3 | PASS | CLI buildDbContainer() — no null |
| HIGH 4 | PASS | assertPermission throws PermissionNotAvailableError |
| MED 5 | **PARTIAL → SPEC FAIL** | Suite 10 covers 5 classes; Migration20260501120538_events_org_id_notnull (6th) omitted |
| MED 6 | PASS | DoctorCheckResult.detail with P14 comment |
| MED 7 | PASS | Web throws error(501, INTERNAL_NOT_WIRED_YET) |

## Required round-3 fixes

1. **MED 5 (SPEC FAIL):** Suite 10 in `tests/db/migrator-service.test.ts:583-589` must include all 6 committed migration classes:
   - Migration20260501104413_auth
   - Migration20260501120537_events_org_id_backfill
   - **Migration20260501120538_events_org_id_notnull** (currently MISSING)
   - Migration20260501130000_composite_indexes
   - Migration20260501130100_flag_stubs
   - Migration20260501140000_schema_migration_ledger

2. **HIGH 2 caveat:** `migrator-service.ts:350-353` — replace silent skip with explicit `MigrationFileMissingError` throw on unreadable applied-migration file. Treat unreadable-but-applied as suspicious (file deleted post-apply could mask drift).

3. **Hygiene:** `+page.server.ts:20-22` stale comment implies conditional stub data load; actual `load` always throws 501 at `:66-70`. Update comment.

4. **Hygiene:** `tests/db/migrator-service.test.ts:539-547` — `callCount` increments but is never asserted. Either add the assertion or remove the dead state.

## Recommendations (non-blocking)

- DI factory unification: add `createDbRuntime()` in `src/db/` returning `{ container, orm, pglite, cleanup }`. Keep `db.module.ts` binding-only. CLI/init/web consume the factory. Reduces lifecycle duplication.
- `migrator-service.ts:207-280` lizard CCN 7 / length 74 — split into smaller helpers when natural seams emerge.

## C6 sweep

Clean.

## Decision flag dispositions

- `assertPermission` → throws ✓
- Web stub → throws via error(501) ✓
- Doctor `detail` field — flagged for P14 alignment per implementer's comment ✓

---

## Disposition

Round-3 fix needed for SPEC PASS: add Migration20260501120538 to Suite 10 + harden checksum-skip path. Hygiene nits can ride along or defer.
