---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/templates — Task Templates Management E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for global task templates management. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config

## Steps

1. Navigate to `/settings/templates`
2. Verify template list renders (may be empty)
3. Click "New Template" → form opens
4. Enter name, type, body text with `{{title}}` placeholder
5. Mark as "Org default" for type "decision"
6. Save → template appears in list with "Default" badge
7. Verify creating a decision doc applies this template (link to P2-13)

## Assertions

- [ ] Templates management page renders
- [ ] Template creation form works
- [ ] Org-default badge shown on default templates
- [ ] Edit and delete work
- [ ] No console errors
