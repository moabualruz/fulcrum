---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P1-06]
---

# Regression: F-002 — /api/openapi.json Unguarded by Flag

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F-002: `src/api/hono.ts:94` — `/api/v1/openapi.json` was accessible without the `public-api` feature flag check. Fixed. Verify it returns 404 without the flag.

## Setup

- Dev server without `public-api` flag
- Dev server WITH `public-api` flag

## Steps

1. Start server without `public-api` flag
2. `GET /api/v1/openapi.json` → expect 404
3. Restart with `FULCRUM_FEATURES=public-api`
4. `GET /api/v1/openapi.json` → expect 200 with valid OpenAPI JSON

## Assertions

- [ ] Returns 404 without `public-api` flag
- [ ] Returns 200 with valid JSON when flag enabled
- [ ] Response is valid OpenAPI 3.x document (has `openapi`, `info`, `paths` keys)
- [ ] No flag bypass possible via query string or headers
