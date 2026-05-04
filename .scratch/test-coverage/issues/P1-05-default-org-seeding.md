---
Status: ready-for-agent
Phase: P1
Priority: critical
Test-file: tests/infrastructure/default-org-seeding.test.ts
Framework: bun-test
Blocked-by: []
---

# Default Org Auto-Seeding

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies that `openProductDb()` creates a default org if none exists. Catches the bug where fresh PGlite DB had no org, causing every `page.server.ts` load function to throw "default org not found".

## Setup

- Fresh PGlite instance via `openProductDb()` with a temp `FULCRUM_HOME` dir
- No pre-existing data

## Steps

1. Open fresh PGlite via `openProductDb()`
2. Query: `SELECT * FROM orgs WHERE slug = 'default'`
3. Call `openProductDb()` again with same path
4. Query again to check for duplicates

## Assertions

- [ ] Exactly 1 row returned after first `openProductDb()`
- [ ] `slug = 'default'`, `name = 'Local'`
- [ ] Calling `openProductDb()` again does NOT create duplicate (still exactly 1 row)
- [ ] `openProductDb()` completes without throwing
