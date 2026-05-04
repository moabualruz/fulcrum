---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/sprints-close.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Sprint Close Dispositions

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Integration test for `sprints.close` with both `backlog` and `next-sprint` disposition modes. Gate review found the `next-sprint` disposition was a no-op (F2-B — fixed). Regression test to ensure fix holds.

## Setup

- PGlite with migrations via `createTestDb()`
- Create org, project, active sprint with 5 tasks assigned
- tRPC caller from server context

## Steps

1. Complete 3 tasks (status=done)
2. Call `sprints.close` with `unfinishedDisposition="backlog"`
3. Verify 2 tasks have `sprint_id=null`
4. Create new sprint (planned)
5. Create another active sprint with 3 tasks, complete 1
6. Call `sprints.close` with `unfinishedDisposition="next-sprint"`
7. Verify 2 tasks moved to the planned sprint's ID
8. Test fallback: no planned sprint exists → disposition defaults to backlog

## Assertions

- [ ] Backlog disposition: 2 unfinished tasks have `sprint_id=null`
- [ ] Next-sprint disposition: 2 unfinished tasks moved to next planned sprint ID
- [ ] No next sprint → falls back to backlog (`sprint_id=null`)
- [ ] Sprint status changes to `completed` after close
- [ ] Metrics snapshot created with non-empty UUID (regression for F1-B)
