---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Regression: F-001 — PGlite ALTER TABLE Incompatibility

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F-001: `src/product-kernel/db/migrations/0004_notifications.sql` — ALTER TABLE incompatibility with PGlite. Fixed. Verify migration 0004 runs clean.

## Setup

- Fresh PGlite instance
- Run migrations up to and including `0004_notifications.sql`

## Steps

1. Run migrations 0001 through 0003 (baseline)
2. Run migration `0004_notifications.sql` specifically
3. Query `pg_catalog.pg_tables` for `notifications` and `notification_rules`
4. Query table schemas to verify columns exist

## Assertions

- [ ] Migration `0004_notifications.sql` executes without error
- [ ] `notification_rules` table exists with expected columns
- [ ] `notifications` table exists with expected columns
- [ ] No PGlite-incompatible SQL syntax errors (ALTER TABLE variants)
