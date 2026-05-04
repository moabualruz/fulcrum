---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P2-08]
---

# Regression: F2-B — next-sprint Disposition Was a No-Op

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F2-B: `src/server/trpc/routers/sprints.ts:268` — `next-sprint` disposition did nothing (tasks stayed in current sprint). Fixed. Verify tasks actually move.

## Setup

- PGlite with migrations via `createTestDb()`
- Active sprint with 3 tasks (1 complete, 2 incomplete)
- A second planned sprint exists

## Steps

1. Call `sprints.close` with `unfinishedDisposition="next-sprint"`
2. Query tasks that were incomplete
3. Verify their `sprint_id` now equals the planned sprint's ID

## Assertions

- [ ] Incomplete tasks have `sprint_id = <next-sprint-id>` (not the closed sprint's ID)
- [ ] Incomplete tasks are NOT still in the closed sprint
- [ ] Complete tasks have `sprint_id = <closed-sprint-id>` (unchanged)
- [ ] Planned sprint task count increased by 2
