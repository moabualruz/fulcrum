---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P2-04]
---

# Regression: CF-03 — Double State Transition After claimRun

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for CF-03: `src/orchestration/symphony/dispatch.ts:95` — double state transition after `claimRun`. Open issue. Test verifies `claimRun` only transitions state once.

## Setup

- PGlite with migrations via `createTestDb()`
- Queued run in DB

## Steps

1. Create a queued run
2. Call `claimRun` once
3. Verify run status is `claimed` (not skipped to `running` or beyond)
4. Verify exactly one state transition event in `events` table
5. Call `claimRun` again on same run → verify error or no-op (not double transition)

## Assertions

- [ ] `claimRun` transitions status from `queued` to `claimed` exactly once
- [ ] Exactly 1 state transition event emitted per claim call
- [ ] Second `claimRun` on already-claimed run is rejected or no-op
- [ ] No status skip from `queued` to `running` in one call
