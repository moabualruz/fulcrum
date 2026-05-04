---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/project-settings.spec.ts
Framework: playwright
Blocked-by: [P3-12]
---

# /projects/[id]/settings/templates — Project Templates Settings E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for project-scoped task template management. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: project with no templates (clean state)

## Steps

1. Navigate to `/projects/<id>/settings/templates`
2. Verify templates list renders (empty state)
3. Click "New Template" → form opens
4. Enter name, body text, applicable type
5. Save → template appears in list
6. Edit template → modify body → save → changes persist
7. Delete template → removed from list

## Assertions

- [ ] Templates settings page renders
- [ ] Empty state shown with "New Template" button
- [ ] Template creation form works
- [ ] Saved template appears in list
- [ ] Edit and delete work correctly
