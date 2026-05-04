---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings-connectors.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/connectors — Connector Config + Sync E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for connector configuration, test-connection, and sync flow. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- Use `page.route()` to mock connector API calls

## Steps

1. Navigate to `/settings/connectors`
2. Verify connector list renders (GitHub Issues, Linear, etc.)
3. Click "Configure" on GitHub Issues connector
4. Enter repo URL and token
5. Click "Test connection" → mock success response → "Connected" shown
6. Click "Sync now" → sync progress shown → completed
7. Verify sync log shows last sync time

## Assertions

- [ ] Connector list renders all supported connectors
- [ ] Config form appears with correct fields
- [ ] Test connection shows success/failure
- [ ] Sync now triggers sync and shows progress
- [ ] Sync log records last sync time
