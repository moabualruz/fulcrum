---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings.spec.ts
Framework: playwright
Blocked-by: [P1-06]
---

# /settings/experiments — Experiments Page E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the experiments settings page (feature-gated). No unit test and no e2e currently exist.

## Setup

- Dev server with `FULCRUM_FEATURES=experiments` flag enabled
- Without flag: verify 404

## Steps

1. Start dev server without `experiments` flag
2. `GET /settings/experiments` → expect 404
3. Restart with `FULCRUM_FEATURES=experiments`
4. Navigate to `/settings/experiments`
5. Verify page renders with experiment toggle list
6. Toggle an experiment ON → page updates without reload

## Assertions

- [ ] Returns 404 when `experiments` flag is OFF
- [ ] Page renders when `experiments` flag is ON
- [ ] Experiment toggles are interactive
- [ ] Toggle state persists
- [ ] No console errors
