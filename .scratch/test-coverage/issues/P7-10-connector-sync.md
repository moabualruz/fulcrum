---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-10.spec.ts
Framework: playwright
Blocked-by: [P3-29, P6-05]
---

# J10: Connector Sync (GitHub Issues)

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: configure GitHub connector → sync → tasks created → audit logged → re-sync incremental. Maps to USER-JOURNEYS.md J10.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- Mock GitHub Issues API via `page.route()`

## Steps

1. Web: `/settings/connectors` → configure GitHub Issues with mock URL + token
2. Click "Test connection" → mock success response
3. Click "Sync now" → mock 3 issues → sync completes
4. Web: project tasks → 3 tasks created from GitHub issues
5. Web: `/audit` → connector.synced event logged
6. Add 1 more issue to mock → "Sync now" again → 1 new task created
7. Verify re-sync is incremental (existing tasks not duplicated)

## Assertions

- [ ] Connector config saved
- [ ] Sync creates tasks from connector data
- [ ] Labels and assignees mapped
- [ ] Audit log records sync event
- [ ] Re-sync is incremental (no duplicates)
