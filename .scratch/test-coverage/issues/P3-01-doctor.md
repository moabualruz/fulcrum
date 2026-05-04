---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/doctor.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /doctor — Health Dashboard E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e verifying the health dashboard renders all 17 subsystem rows without auth. No existing e2e for this route.

## Setup

- Dev server via Playwright `webServer` config
- No auth required (public route)

## Steps

1. Navigate to `/doctor`
2. Wait for table to render
3. Click "Refresh now" button
4. Check Inference row for failure recovery hint

## Assertions

- [ ] Page title contains "Doctor"
- [ ] Table has ≥17 rows (one per subsystem)
- [ ] Each row has: subsystem name, status badge, message, timestamp
- [ ] "Refresh now" button exists and is clickable
- [ ] At least "Foundation" subsystem shows "OK"
- [ ] If "Inference" shows "FAIL" → recovery hint button visible
- [ ] No console errors on page load
