---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/inbox.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-03]
---

# /inbox — Notification List E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for notification list, mark-all-read action, and activity feed pagination.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 5 notifications via PGlite test fixture

## Steps

1. Navigate to `/inbox`
2. Verify notification list renders with 5 items
3. Verify bell badge count shows 5
4. Click "Mark all read"
5. Verify badge clears and notifications marked read
6. Click "Activity" tab → activity feed renders
7. Scroll to bottom → pagination loads more items (if >20)

## Assertions

- [ ] Notification list renders with correct count
- [ ] Each notification shows title, timestamp, read/unread status
- [ ] "Mark all read" clears unread badge
- [ ] Activity feed tab is accessible
- [ ] Pagination works (next page loads on scroll)
- [ ] No 500 errors or console errors
