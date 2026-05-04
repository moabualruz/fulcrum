---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-11.spec.ts
Framework: playwright
Blocked-by: [P1-06, P3-22]
---

# J11: Feature Flag Gating

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: toggle flag via web → route accessible/hidden → CLI flag change → web reflects. Maps to USER-JOURNEYS.md J11.

## Setup

- Dev server via Playwright `webServer` config

## Steps

1. Web: `/settings/flags` → "i18n" is OFF
2. Navigate to `/settings/i18n` → 404
3. Web: toggle "i18n" ON → navigate to `/settings/i18n` → accessible
4. Toggle "i18n" OFF → `/settings/i18n` returns 404
5. CLI: `fulcrum flags set i18n on`
6. Web: `/settings/i18n` → now accessible

## Assertions

- [ ] Flag OFF → gated route returns 404
- [ ] Flag ON → gated route accessible
- [ ] Toggle propagates without restart
- [ ] CLI flag change reflected in web route access
- [ ] No route leaks (200 when flag OFF)
