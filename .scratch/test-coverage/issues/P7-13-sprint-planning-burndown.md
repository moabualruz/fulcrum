---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-13.spec.ts
Framework: playwright
Blocked-by: [P7-03, P6-14]
---

# J13: Sprint Planning + Burndown Accuracy

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: full sprint lifecycle from create → assign → track → close → burndown accurate. Maps to USER-JOURNEYS.md J13.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- Project with 10 tasks pre-seeded

## Steps

1. Web: create sprint, assign 8 tasks
2. Web: sprint board shows capacity (8 tasks)
3. Complete 5 tasks over simulated time
4. Web: close sprint (3 incomplete → backlog)
5. Web: `/projects/<id>/reports` → burndown shows velocity=5, remaining=3
6. CLI: `fulcrum sprints list --json` → completed sprint with metrics

## Assertions

- [ ] Sprint board shows correct capacity
- [ ] Close moves incomplete tasks to backlog
- [ ] Burndown chart renders with accurate data
- [ ] Velocity matches completed task count
- [ ] Remaining count matches incomplete tasks
