---
Status: ready-for-agent
Phase: P1
Priority: critical
Test-file: tests/infrastructure/feature-flag-gating.test.ts
Framework: playwright
Blocked-by: []
---

# Feature Flag Gating Consistency

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies that every `FULCRUM_FEATURES=X` flag correctly hides/shows its gated route. Catches `/api/openapi.json` being exposed without the `public-api` flag check (gate finding F-002).

## Setup

- Two dev server spawns: one with `FULCRUM_FEATURES=""` (all off), one with specific flag enabled
- Gated routes under test: `/settings/i18n`, `/settings/experiments`, `/settings/billing`, `/settings/api`, `/api/v1/openapi.json`

## Steps

For each gated route:
1. Start dev server with `FULCRUM_FEATURES=""` (all flags off)
2. `GET <route>` → expect 404
3. Start dev server with `FULCRUM_FEATURES=<correct-flag>`
4. `GET <route>` → expect 200

## Assertions

- [ ] All gated routes return 404 when their flag is OFF
- [ ] All gated routes return 200 when their flag is ON
- [ ] No route leaks (returns 200 with flag OFF)
- [ ] `/api/v1/openapi.json` returns 404 without `public-api` flag
