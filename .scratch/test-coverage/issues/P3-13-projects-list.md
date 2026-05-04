---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/projects.spec.ts
Framework: playwright
Blocked-by: [P3-12]
---

# /projects/[id]/list — Project List View E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the project list view. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: project with 5 tasks (varied statuses)

## Steps

1. Navigate to `/projects/<id>/list`
2. Verify task list renders with 5 items
3. Verify each task shows title, status, assignee, priority
4. Click task → opens task detail panel or navigates
5. Filter by status "in-progress" → only in-progress tasks shown
6. Sort by priority → order changes

## Assertions

- [ ] Task list renders with correct count
- [ ] Each task shows title, status badge, priority
- [ ] Status filter narrows list
- [ ] Sort changes ordering
- [ ] Clicking task opens detail
- [ ] No console errors
