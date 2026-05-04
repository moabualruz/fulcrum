---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings-integrations.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/integrations/linear — Linear Connector Config E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for Linear connector configuration page. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Mock Linear API or use `page.route()` to intercept requests

## Steps

1. Navigate to `/settings/integrations/linear`
2. Verify config form renders (API key input, workspace selector)
3. Enter mock API key → click "Test connection"
4. Mock endpoint returns success → success indicator shown
5. Mock endpoint returns 401 → error message shown
6. Save valid config → settings persisted

## Assertions

- [ ] Linear config form renders
- [ ] "Test connection" sends request to Linear API
- [ ] Success response shows "Connected" indicator
- [ ] Error response shows error message with hint
- [ ] Valid config saves without error
