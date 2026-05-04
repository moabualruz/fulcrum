---
Status: ready-for-agent
Phase: P1
Priority: critical
Test-file: tests/infrastructure/auth-mode.test.ts
Framework: bun-test
Blocked-by: []
---

# Auth Mode (Dev Bypass vs FULCRUM_REQUIRE_AUTH)

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies that routes are accessible without login when `FULCRUM_REQUIRE_AUTH` is unset, and that they redirect to `/auth/login` when it is set. Catches the bug where all routes required login in dev mode.

## Setup

- Two separate vite dev spawns, each with different env
- Random port per spawn to avoid conflicts

## Steps

**Test 1 — Dev mode (no `FULCRUM_REQUIRE_AUTH`):**
1. Start vite dev without env var
2. `GET /` → 200 (auto-session active)
3. Response HTML contains "Dashboard" not "Log in"

**Test 2 — Auth mode (`FULCRUM_REQUIRE_AUTH=1`):**
1. Start vite dev with `FULCRUM_REQUIRE_AUTH=1`
2. `GET /` → 302 redirect to `/auth/login`
3. `GET /doctor` → 200 (exempt from auth)

## Assertions

- [ ] Dev mode: `GET /` returns 200
- [ ] Dev mode: response body contains dashboard content, not login form
- [ ] Auth mode: `GET /` returns 302 → `/auth/login`
- [ ] Auth mode: `GET /doctor` returns 200 (public route exempt)
