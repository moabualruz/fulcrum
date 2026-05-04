---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/pglite-web-context.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-05]
---

# Product-Kernel PGlite in Web Context

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies that `openProductDb()` + `runMigrations()` works correctly in the web/SvelteKit context. Only product-kernel unit tests currently exist; no test exercises the full path used by `page.server.ts` load functions.

## Setup

- Temporary `FULCRUM_HOME` directory
- Import `openProductDb` from `src/product-kernel/db/pglite.ts`
- Simulate the SvelteKit server-side environment

## Steps

1. Call `openProductDb()` with temp `FULCRUM_HOME`
2. Verify migrations all ran (query `pg_tables`)
3. Verify default org was seeded
4. Call `openProductDb()` again (same path) → verify idempotent (no duplicate migration)
5. Execute a representative query used by a `page.server.ts` load function
6. Call `closeProductDb()` → verify connection closed cleanly

## Assertions

- [ ] `openProductDb()` completes without throwing
- [ ] All expected tables exist after first call
- [ ] Default org (slug=`default`) exists
- [ ] Second call is idempotent (no error, no duplicate rows)
- [ ] Representative page load query returns correct data shape
- [ ] DB closes cleanly without resource leak warnings
