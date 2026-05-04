---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/projects.spec.ts
Framework: playwright
Blocked-by: [P3-12]
---

# /projects/[id]/table — Project Table View E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the project table view. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: project with 5 tasks with custom fields

## Steps

1. Navigate to `/projects/<id>/table`
2. Verify spreadsheet-style table renders
3. Verify columns include: Title, Status, Priority, Assignee, Due Date
4. Click a cell → inline edit opens
5. Change a value → Tab to next cell → change persists
6. Add new row → task created inline
7. Toggle column visibility → column hides/shows

## Assertions

- [ ] Table renders with correct rows and columns
- [ ] Inline editing works for text cells
- [ ] Changes persist after Tab/blur
- [ ] New row creates a task in DB
- [ ] Column visibility toggle works
- [ ] No console errors
