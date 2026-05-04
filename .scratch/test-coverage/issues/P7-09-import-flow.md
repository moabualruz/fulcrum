---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-09.spec.ts
Framework: playwright
Blocked-by: [P3-30, P6-07]
---

# J09: Import from External Tool

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: web CSV import → tasks appear on project board → search indexes them. Maps to USER-JOURNEYS.md J09.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- Sample CSV with 5 task rows prepared

## Steps

1. Web: `/settings/importers` → select CSV tab
2. Upload sample CSV (5 tasks)
3. Preflight shows 5 tasks ready
4. Confirm import → progress → complete
5. Web: project board → 5 tasks appear in Todo column
6. Web: search for a task title → task found in results
7. CLI: `fulcrum tasks list --json` → 5 tasks in output

## Assertions

- [ ] CSV upload accepted and preflight validates
- [ ] Import creates all 5 tasks
- [ ] Tasks appear on project board
- [ ] Search indexes imported tasks
- [ ] CLI reflects imported tasks
