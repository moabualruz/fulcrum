---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/projects.spec.ts
Framework: playwright
Blocked-by: [P3-12]
---

# /projects/[id]/routing — Routing Rules UI E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the task routing rules configuration UI. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: project with no routing rules

## Steps

1. Navigate to `/projects/<id>/routing`
2. Verify routing rules list renders (empty state OK)
3. Click "Add Rule" → rule creation form appears
4. Enter condition (e.g., label contains "bug") and action (assign to project)
5. Save rule → rule appears in list
6. Toggle rule ON/OFF → toggle state persists
7. Delete rule → removed from list

## Assertions

- [ ] Routing rules page renders without error
- [ ] Empty state shows "No rules yet"
- [ ] Rule creation form works
- [ ] Rule saved appears in list with condition and action
- [ ] Toggle persists ON/OFF state
- [ ] Delete removes rule
