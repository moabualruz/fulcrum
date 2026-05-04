---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-14.spec.ts
Framework: playwright
Blocked-by: [P3-01, P6-06]
---

# J14: Doctor Health Check

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: web doctor shows all subsystems → auto-refresh → CLI doctor matches web output → fix failure → verify recovery. Maps to USER-JOURNEYS.md J14.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config

## Steps

1. Web: `/doctor` → 17 subsystems listed, ≥15 OK
2. Subsystem with FAIL → recovery hint shown
3. Click "Refresh now" → timestamps update (no full reload)
4. Wait 30s → auto-refresh fires → timestamps update
5. CLI: `fulcrum doctor --json` → same subsystem statuses
6. CLI exit code 0 if all ok/warn; 1 if any fail
7. Fix a failure → refresh web → status changes to OK

## Assertions

- [ ] All 17 subsystems rendered on web
- [ ] Recovery hints shown for failing subsystems
- [ ] Manual refresh updates timestamps
- [ ] Auto-refresh works after 30s
- [ ] CLI output matches web statuses
- [ ] CLI exit codes correct (0=ok, 1=fail)
