---
Status: ready-for-agent
Phase: P1
Priority: critical
Test-file: tests/infrastructure/dev-server-smoke.test.ts
Framework: bun-test
Blocked-by: []
---

# Dev Server Smoke

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Starts `vite dev`, waits for ready, hits key routes with fetch, asserts HTTP 200. Catches SSR import failures, route load crashes, missing default org.

## Setup

- Set `FULCRUM_HOME` to a tmpdir
- Spawn `npx vite dev --port <random>` from `src/web/`
- Wait for "ready in" stdout line before running assertions

## Steps

1. `GET /` → expect 200 (dev mode auto-session, not 302)
2. `GET /doctor` → expect 200
3. `GET /auth/login` → expect 200
4. `GET /nonexistent` → expect 404
5. Check Vite stdout for zero "500" or "SyntaxError" lines

## Assertions

- [ ] HTTP 200 on `/`, `/doctor`, `/auth/login`
- [ ] HTTP 404 on `/nonexistent`
- [ ] No SSR errors in server stdout
- [ ] Server starts within 30 seconds
