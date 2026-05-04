---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings-webhooks.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-14]
---

# /settings/webhooks — Webhook Subscription CRUD + Delivery Log E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for webhook subscription CRUD and delivery log. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- Use `page.route()` to mock webhook delivery endpoint

## Steps

1. Navigate to `/settings/webhooks`
2. Verify webhook list renders (empty state OK)
3. Click "New Webhook" → form with URL, events, secret
4. Enter URL `https://example.com/hook`, select `task.*` events
5. Save → webhook appears in list
6. Trigger a task event → delivery attempt in delivery log
7. View delivery log → shows attempt with status, response code, timestamp
8. Delete webhook → removed from list

## Assertions

- [ ] Webhook CRUD operations work
- [ ] Delivery log shows attempt history
- [ ] Success/failure indicators in delivery log
- [ ] Delete removes webhook
