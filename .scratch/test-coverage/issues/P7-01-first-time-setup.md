---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-01.spec.ts
Framework: playwright
Blocked-by: [P1-02, P1-05, P6-12]
---

# J01: First-Time Local Setup

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Full cross-surface journey: run `fulcrum product init` → start web server → navigate to key routes → verify empty states render correctly without crashes. Maps to USER-JOURNEYS.md J01.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- PGlite auto-initialized

## Steps

1. Run `fulcrum product init` via `exec` → verify exit 0 and "initialized" message
2. Navigate to `/` → dashboard renders, counts are 0
3. Navigate to `/projects` → "No projects yet" empty state
4. Navigate to `/doctor` → ≥14 subsystems listed, most "OK"
5. Navigate to `/settings/theme` → theme controls render

## Assertions

- [ ] `fulcrum product init` exits 0
- [ ] Dashboard renders with 0 projects, 0 tasks, 0 docs, 0 runs
- [ ] `/projects` shows empty state (no crash)
- [ ] `/doctor` renders ≥14 subsystem rows
- [ ] `/settings/theme` renders without error
- [ ] No 500 errors or console errors throughout
