---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-05.spec.ts
Framework: playwright
Blocked-by: [P3-04, P3-05, P3-28, P2-05, P6-01]
---

# J05: Agent Run + Artifacts + Monitoring

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: dispatch agent run from web → monitor status → view artifacts → verify via CLI. Maps to USER-JOURNEYS.md J05.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- Agent profile pre-registered

## Steps

1. Web: `/agents` → dispatch agent run for a task
2. Web: `/runs` → new run appears with status "queued"
3. Web: status updates through queued → claimed → running → completed
4. Web: `/runs/<id>` → log output, duration, token usage shown
5. Web: artifacts tab → files produced by run
6. CLI: `fulcrum runs list --json` → run present
7. CLI: `fulcrum runs logs <id>` → log output printed
8. Web: `/orchestration` → run in completed queue

## Assertions

- [ ] Run lifecycle visible in real-time on web
- [ ] Artifacts attached and viewable
- [ ] CLI retrieves run data
- [ ] Orchestration dashboard reflects state
