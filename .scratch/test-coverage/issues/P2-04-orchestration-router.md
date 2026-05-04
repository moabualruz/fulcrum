---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/orchestration.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Orchestration Router Integration Test

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

tRPC integration test for the `orchestration` router — workflow and run queue management procedures. No integration test currently exists.

## Setup

- PGlite with all migrations via `createTestDb()`
- Default org created via `createLocalOrg()`
- tRPC caller from server context

## Steps

1. Call `orchestration.queueRun` with agent profile and task ID
2. Call `orchestration.listQueue` → verify run appears in queue
3. Call `orchestration.claimRun` → verify status transitions to `claimed`
4. Call `orchestration.updateRunStatus` → mark as `running`
5. Call `orchestration.completeRun` → verify status is `completed`
6. Call `orchestration.cancelRun` on a queued run → verify status `cancelled`

## Assertions

- [ ] `orchestration.queueRun` creates a run with status `queued`
- [ ] `orchestration.listQueue` returns the queued run
- [ ] `orchestration.claimRun` changes status to `claimed`
- [ ] `orchestration.completeRun` changes status to `completed`
- [ ] `orchestration.cancelRun` changes status to `cancelled`
- [ ] Double state transition (CF-03) does not occur during claim
