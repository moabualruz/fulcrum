---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/database/migrations — Migration Status Viewer E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the database migration status viewer. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Real PGlite with all migrations run

## Steps

1. Navigate to `/settings/database/migrations`
2. Verify migration list renders with all executed migrations
3. Each row shows: filename, status (applied/pending), applied-at timestamp
4. Verify "Run pending migrations" button exists (or shows "Up to date")
5. Verify no failed migrations shown

## Assertions

- [ ] Migration list renders without error
- [ ] All applied migrations show "applied" status with timestamp
- [ ] No pending migrations in a fresh initialized DB
- [ ] "Up to date" message shown when no pending migrations
- [ ] No console errors
