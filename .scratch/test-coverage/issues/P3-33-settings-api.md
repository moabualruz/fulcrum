---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings.spec.ts
Framework: playwright
Blocked-by: [P1-06]
---

# /settings/api — Feature-Gated 404 Behavior E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for API settings page — gated 404 behavior when `public-api` flag is OFF. No e2e currently exists.

## Setup

- Dev server without `public-api` flag
- Second server with `FULCRUM_FEATURES=public-api`

## Steps

1. Start dev server without `public-api` flag
2. Navigate to `/settings/api` → expect 404 page
3. Restart with `FULCRUM_FEATURES=public-api`
4. Navigate to `/settings/api` → API settings page renders
5. Verify page shows API token management, rate limits, etc.

## Assertions

- [ ] Returns 404 when `public-api` flag OFF
- [ ] Renders API settings page when `public-api` flag ON
- [ ] API token generation/revocation visible when enabled
