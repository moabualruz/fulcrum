---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/auth.spec.ts
Framework: playwright
Blocked-by: [P1-04]
---

# /auth/invite/[token] — Invite Acceptance Flow E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the invite acceptance flow. No unit test and no e2e currently exist.

## Setup

- Dev server with `FULCRUM_REQUIRE_AUTH=1`
- Seed: valid invite token in DB

## Steps

1. Navigate to `/auth/invite/<valid-token>`
2. Verify invite acceptance form renders (email pre-filled, name input)
3. Enter display name → click "Accept Invite"
4. Verify user created and session started → redirect to dashboard
5. Navigate to `/auth/invite/<expired-token>` → error page shown
6. Navigate to `/auth/invite/<invalid-token>` → 404 or error page

## Assertions

- [ ] Valid token renders invite acceptance form
- [ ] Accepting invite creates user and session
- [ ] Redirect to dashboard after acceptance
- [ ] Expired token shows appropriate error
- [ ] Invalid token shows 404 or error page
