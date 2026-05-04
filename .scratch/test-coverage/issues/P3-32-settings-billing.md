---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings.spec.ts
Framework: playwright
Blocked-by: [P1-06]
---

# /settings/billing — Feature-Gated 404 Behavior E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for billing page — specifically the gated 404 behavior when the `billing` flag is OFF. No e2e currently exists.

## Setup

- Dev server with `FULCRUM_FEATURES=""` (billing flag off)
- Second server with `FULCRUM_FEATURES=billing`

## Steps

1. Start dev server without `billing` flag
2. Navigate to `/settings/billing` → expect 404 page
3. Restart with `FULCRUM_FEATURES=billing`
4. Navigate to `/settings/billing` → billing page renders
5. Verify billing page shows plan info / upgrade options

## Assertions

- [ ] Returns 404 (or custom "not found" page) when `billing` flag OFF
- [ ] Renders billing page when `billing` flag ON
- [ ] 404 page does not leak billing UI elements
