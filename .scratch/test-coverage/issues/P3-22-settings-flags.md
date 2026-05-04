---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/flags — Feature Flags UI E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the feature flags settings page. Vitest unit test exists but no `page.server.test.ts` and no e2e.

## Setup

- Dev server via Playwright `webServer` config

## Steps

1. Navigate to `/settings/flags` (or `/settings/feature-flags`)
2. Verify flag list renders with all known flags
3. Toggle a flag ON → badge changes to ON
4. Reload page → verify flag state persisted
5. Toggle flag OFF → badge changes to OFF
6. Reload → verify flag is OFF

## Assertions

- [ ] Feature flags page renders with all flags listed
- [ ] Each flag shows name, description, current state
- [ ] Toggle persists across page reload
- [ ] OFF→ON and ON→OFF both work
- [ ] No console errors
