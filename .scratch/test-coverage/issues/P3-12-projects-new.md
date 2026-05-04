---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/projects.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /projects/new — Project Creation Wizard E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the project creation wizard. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- No seed needed

## Steps

1. Navigate to `/projects`
2. Click "New Project" button
3. Verify wizard opens (or navigates to `/projects/new`)
4. Enter name "Test Project" and slug "test-project"
5. Select color and icon (if available)
6. Click "Create" → redirects to `/projects/test-project`
7. Verify project page shows "Test Project" heading
8. Verify sidebar lists "Test Project" under Projects

## Assertions

- [ ] New project form renders with name and slug fields
- [ ] Slug auto-generated from name (or editable)
- [ ] Create redirects to project page
- [ ] Project page shows correct name
- [ ] Sidebar reflects new project
- [ ] No console errors
