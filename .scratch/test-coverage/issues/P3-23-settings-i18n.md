---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings.spec.ts
Framework: playwright
Blocked-by: [P1-06]
---

# /settings/i18n — Locale Switching E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for locale switching. Feature-gated behind `i18n` flag. No unit test and no e2e currently exist.

## Setup

- Dev server with `FULCRUM_FEATURES=i18n` flag enabled

## Steps

1. Navigate to `/settings/i18n`
2. Verify locale picker renders (English selected by default)
3. Select "Spanish (es)" → UI text changes to Spanish
4. Reload page → Spanish locale persists
5. Select "Arabic (ar)" → `dir="rtl"` set on `<html>`
6. Verify sidebar flips to right side
7. Revert to English → RTL removed

## Assertions

- [ ] Locale picker renders
- [ ] Locale change updates visible UI text
- [ ] Locale persists across reload
- [ ] Arabic sets `dir="rtl"` on `<html>`
- [ ] English revert removes RTL
