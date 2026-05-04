---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P3-34]
---

# Regression: F06 — Misleading sha256 Prefix on Base64 Secret Display

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F06: `src/web/src/routes/settings/secrets/+page.server.ts:46` — secret display showed `sha256:<base64>` prefix even though it was not actually sha256 hashed. Fixed. Verify display format is correct.

## Setup

- PGlite with migrations via `createTestDb()`
- Secret created with a known value

## Steps

1. Create a secret with value "sk-test-123"
2. Retrieve the secret display hint via `secrets.list` tRPC
3. Inspect the `hint` or `maskedValue` field in the response

## Assertions

- [ ] `hint` field does NOT start with `sha256:` prefix
- [ ] `hint` field shows appropriate masking (e.g. `sk-te****`)
- [ ] The actual secret value is not exposed in plain text
- [ ] Hint format is consistent and human-readable
