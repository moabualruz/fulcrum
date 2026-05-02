# Codex Re-Review — P1#03 fix (commit 7421308)

**Reviewing:** `fix(db): composite-indexes EXPLAIN Index Scan + CasbinRule C11 citation + flag-stubs C10 audit (P1#03 follow-up)`
**Reviewer:** Codex (gpt-5-codex, medium effort)
**Date:** 2026-05-01

---

## Verdict

- **SPEC: PASS**
- **QUALITY: CHANGES_REQUIRED** (one minor test-completeness gap; non-blocking)

All 3 round-1 findings resolved. Sole nit: `flag-stubs.test.ts` lacks an explicit `expect(props["createdAt"]).toBeUndefined()` assertion for WebhookSubscription + NotificationRule (comments note the deferral but no actual assertion). Code-side trimming is correct.

---

## Per-finding verification

| # | Claim | Evidence | Status |
|---|---|---|---|
| 1 | 8 stubs each run EXPLAIN with `/Index Scan/i` AND NOT `/Seq Scan/i` AND `spec.indexName` | `tests/db/migrations/composite-indexes.test.ts:204-241`; regex correctly distinguishes `Bitmap Index Scan` from `Bitmap Heap Scan` | PASS |
| 2 | CasbinRule cites C11 verbatim | `src/db/entities/flags/CasbinRule.ts:15-18` | PASS |
| 3 | WebhookSubscription + NotificationRule trimmed; migration regenerated; tests guard deferred columns | Entities at `:42-51`; migration DDL omits deferred at `Migration20260501130100_flag_stubs.ts:36, :49`; tests guard `url/events/secret/verb/channel/target` at `flag-stubs.test.ts:140-142, :177-179`. **Gap**: `createdAt` not guarded with `toBeUndefined()` (comments at `:130-131, :166-167` mention deferral only). | CODE PASS, TEST GAP |

## C6 sweep
Clean — 7 changed files, no `.sql` paths, no out-of-scope source changes.

## Hygiene followup (non-blocking)

Add `expect(props["createdAt"]).toBeUndefined()` (or equivalent property-count assertion) to:
- `tests/db/migrations/flag-stubs.test.ts:128-143` (WebhookSubscription block)
- `tests/db/migrations/flag-stubs.test.ts:164-180` (NotificationRule block)

OR replace metadata tests with exact property-count assertions matching the C10-minimum count per entity.

## Pre-existing failure note
`check-migrations.test.ts` failure is from P1#19 — out of scope for this review.

---

## Disposition

P1#03 SPEC PASSES. Code-side correctness verified. Test-completeness gap is a hygiene nit, not a blocker. **Mark P1#03 `Status: completed` with the gap deferred to a hygiene PR.**
