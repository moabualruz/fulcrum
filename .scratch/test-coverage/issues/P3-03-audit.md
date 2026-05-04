---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/audit.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /audit — Audit Log E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for audit log filtering (actor, kind, date range) and pagination.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 20 audit events with varied kinds (task.created, task.updated, sprint.closed)

## Steps

1. Navigate to `/audit`
2. Verify event list renders
3. Filter by kind "task" → only task.* events shown
4. Filter by date range (today) → events from today only
5. Clear filters → all events shown again
6. Click "Export CSV" → file download starts

## Assertions

- [ ] Audit log renders with events
- [ ] Kind filter narrows results correctly
- [ ] Date range filter narrows results correctly
- [ ] Clearing filters restores full list
- [ ] Pagination works for large event sets
- [ ] CSV export triggers file download
