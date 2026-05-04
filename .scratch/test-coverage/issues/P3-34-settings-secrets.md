---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings-secrets.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/secrets — Secret Management UI E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for secret management UI. No e2e currently exists. Also verifies the fix for the misleading sha256 prefix on base64 display (gate finding F06 — fixed).

## Setup

- Dev server via Playwright `webServer` config

## Steps

1. Navigate to `/settings/secrets`
2. Verify secrets list renders (empty state OK)
3. Click "Add Secret" → form with name and value fields
4. Enter name "OPENAI_API_KEY", value "sk-test-123"
5. Save → secret appears in list with name and masked value
6. Verify displayed masked value does NOT show `sha256:` prefix (F06 regression)
7. Verify actual value is not shown in plain text
8. Delete secret → removed from list

## Assertions

- [ ] Secrets management page renders
- [ ] Secrets CRUD works
- [ ] Values masked in display (not shown in plain text)
- [ ] Displayed hint does NOT have `sha256:` prefix (regression for F06)
- [ ] Delete removes secret
