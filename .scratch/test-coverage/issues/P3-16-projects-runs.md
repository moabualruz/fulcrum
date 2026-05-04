---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/projects.spec.ts
Framework: playwright
Blocked-by: [P3-12, P2-05]
---

# /projects/[id]/runs — Project-Scoped Runs E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for project-scoped run list. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: project with 3 runs (1 per status: completed, running, failed)

## Steps

1. Navigate to `/projects/<id>/runs`
2. Verify run list renders with 3 items
3. Verify status badges match seeded data
4. Filter by status "completed" → only completed run shown
5. Click run → navigates to run detail

## Assertions

- [ ] Run list renders with seeded runs
- [ ] Status badges are correct
- [ ] Status filter narrows list
- [ ] Navigation to run detail works
- [ ] No console errors
