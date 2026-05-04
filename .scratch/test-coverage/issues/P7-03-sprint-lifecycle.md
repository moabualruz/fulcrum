---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-03.spec.ts
Framework: playwright
Blocked-by: [P2-08, P2-09, P6-14]
---

# J03: Sprint Planning + Close + Burndown

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: create sprint via web → assign tasks → close with disposition → burndown report → CLI verification. Maps to USER-JOURNEYS.md J03.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- Project with 5 tasks pre-seeded

## Steps

1. Web: create Sprint 1, assign 5 tasks
2. Web: complete 3 tasks (status → done)
3. Web: close sprint with "Backlog" disposition
4. Verify 2 incomplete tasks have `sprint_id=null`
5. Web: `/projects/<id>/reports` → burndown chart renders
6. CLI: `fulcrum sprints list --project <id> --json` → Sprint 1 status=completed

## Assertions

- [ ] Sprint creation and task assignment works
- [ ] Close with backlog disposition moves 2 tasks to backlog
- [ ] Metrics snapshot ID is non-empty (regression P2-09)
- [ ] Burndown report renders with data
- [ ] CLI reflects correct sprint status
