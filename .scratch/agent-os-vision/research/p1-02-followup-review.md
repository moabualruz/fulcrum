# Codex Re-Review — P1#02 fix (commit 7edef30)

**Reviewing:** `fix(db): events backfill — migrator round-trip test + nullable→backfill→NOT NULL ordering + @Index DESC (P1#02 follow-up)`
**Reviewer:** Codex (gpt-5-codex, medium effort)
**Date:** 2026-05-01

---

## Verdict

- **SPEC: FAIL**
- **QUALITY: CHANGES_REQUIRED**

Blocker 2 (migration order) PASS. Blocker 3 (@Index DESC expression form) PASS. Blocker 1 (migrator round-trip test) STILL FAILS — test inserts the null-org row AFTER `ormA.migrator.up()` then manually replays SQL on a separate `ormB` ORM. The real migrator never actually backfills a live null-org row in the test.

---

## Per-blocker

| # | Status | Notes |
|---|---|---|
| 1 | ❌ STILL OPEN | null-org row inserted post-migrator-up; manual SQL replay on ormB. Migrator backfill code path untested against pre-existing null-org data. |
| 2 | ✅ PASS | up() body now: CREATE TABLE (org_id NULL) → UPDATE backfill → ALTER COLUMN SET NOT NULL → FK → indexes. |
| 3 | ✅ PASS | Both `@Index` decorators use `expression` form with `created_at DESC`. |

---

## C6 sweep

Two issues:

1. `@Index({ expression: 'CREATE INDEX … ("org_id", "created_at" DESC)' })` strings inside `Event.ts`. **Note for orchestrator:** these are C6-SANCTIONED per the PRD/DECISIONS — `@Index` expression is an explicit carve-out for FTS/desc-ordering/HNSW. Reviewer was uncertain; orchestrator confirms this is allowed.

2. Raw SQL strings inside `tests/db/migrations/events-backfill.test.ts` test helpers (manual `INSERT`/`UPDATE` for the `ormB` replay path). **This is a real C6 violation** — test helpers must use `em.create / em.flush / em.nativeUpdate` (which is OK because `nativeUpdate` accepts a typed-where + typed-set, not raw SQL) instead of literal SQL strings.

---

## Open concerns

- **`transactional: false / allOrNothing: false` workaround** for PGlite savepoint limitation: acceptable as a TEST-LOCAL setting but must NOT leak into `src/db/mikro-orm.config.ts` production path. Scope guard required.
- **`tests/db/migrations/explain-probe-test.test.ts`** untracked — Codex couldn't fully audit; orchestrator should verify it follows C6 and is not orphan dead code.

---

## Required changes (round 3)

1. Restructure the migrator round-trip test:
   - Phase 1: bring up empty schema (NO migration applied yet for events).
   - Phase 2: insert a row directly into `events` table with `org_id IS NULL` — use `em.getConnection().execute("INSERT INTO events (id, verb, created_at) VALUES (?, ?, now())", [...])` ONLY IF the schema state at this point physically allows null `org_id`. Document this is a test-only raw call to set up the pre-migration state.
   - Phase 3: call `migrator.up({ to: 'Migration<timestamp>_events_org_id_backfill' })`.
   - Phase 4: assert `eventRepo.count({ org: null }) === 0` AND assert the original row's `org_id` is now the local default org UUID.

   The pre-migration "raw INSERT" inside test setup is a C6 carve-out specifically because the schema at that point doesn't yet have the entity-class-managed shape — the test is exercising the backfill behavior that exists precisely to handle pre-existing rows. Add a code comment citing C6 + naming the test-only carve-out.

2. Strip the `ormB` manual SQL replay path entirely. Replace with the Phase 1-4 flow above, single ORM instance.

3. Audit `tests/db/migrations/events-backfill.test.ts` test helpers: any raw SQL outside the Phase 2 sanctioned carve-out must be replaced with `em.create / em.flush / em.nativeUpdate` (typed-where + typed-set, not raw SQL).

4. Confirm `transactional: false / allOrNothing: false` lives only in test config — `src/db/mikro-orm.config.ts` (production path) MUST stay default-transactional. Add a code comment in test config citing PGlite savepoint limitation + linking the MikroORM issue.

5. Audit `tests/db/migrations/explain-probe-test.test.ts` (untracked, may be from this round): is it part of the P1#02 fix or orphan? If orphan, delete; if intentional, integrate cleanly + ensure C6 compliance.
