---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings-importers.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/importers — Import Wizard E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for import wizard: CSV upload, preflight validation, confirm import. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- Prepare a sample CSV file with 10 task rows

## Steps

1. Navigate to `/settings/importers`
2. Select "CSV" importer tab
3. Upload sample CSV file
4. Verify preflight results: "10 tasks ready to import", field mapping shown
5. Confirm import → progress shown → completed
6. Navigate to project board → 10 tasks appear
7. Test with malformed CSV → error shown with row details

## Assertions

- [ ] Importer page renders with format tabs
- [ ] CSV upload accepted
- [ ] Preflight shows row count and field mapping
- [ ] Import completes and tasks created
- [ ] Malformed CSV shows error with helpful message
