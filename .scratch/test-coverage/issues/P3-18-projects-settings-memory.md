---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/project-settings.spec.ts
Framework: playwright
Blocked-by: [P3-12]
---

# /projects/[id]/settings/memory — Project Memory Settings E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for project-scoped memory settings page. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: project with existing memory settings

## Steps

1. Navigate to `/projects/<id>/settings/memory`
2. Verify settings form renders (memory retention, extraction enabled toggle, importance threshold)
3. Toggle memory extraction ON/OFF → toggle state changes
4. Change retention period → save → setting persists after reload
5. Verify changes reflected in memory behavior

## Assertions

- [ ] Settings page renders without error
- [ ] Toggle controls work
- [ ] Save persists settings across reload
- [ ] No console errors
