---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings-orchestration.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-04]
---

# /settings/orchestration/workflows/[id] — Workflow Editor E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the orchestration workflow editor. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 1 workflow definition

## Steps

1. Navigate to `/settings/orchestration/workflows/<id>`
2. Verify workflow editor renders with step list
3. Add a step → step appears in the list
4. Reorder steps (drag or up/down arrows)
5. Save workflow → persisted to DB
6. Load workflow again → steps in correct order

## Assertions

- [ ] Workflow editor renders without error
- [ ] Existing steps shown
- [ ] Step addition works
- [ ] Reordering works
- [ ] Save persists step order
- [ ] No console errors
