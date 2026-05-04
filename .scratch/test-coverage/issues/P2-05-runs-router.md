---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/runs.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Runs Router Integration Test

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

tRPC integration test for the `runs` router — run CRUD, status transitions, and log streaming. No integration test currently exists.

## Setup

- PGlite with all migrations via `createTestDb()`
- Default org and project via `createLocalOrg()`
- tRPC caller from server context

## Steps

1. Call `runs.create` with agent, task, project refs
2. Call `runs.list` → verify run appears
3. Call `runs.get` by ID → verify fields
4. Call `runs.appendLog` with log lines
5. Call `runs.getLogs` → verify log lines returned in order
6. Call `runs.updateStatus` through full lifecycle (queued → running → completed)
7. Call `runs.delete` → verify removed

## Assertions

- [ ] `runs.create` returns run with valid UUID and status `queued`
- [ ] `runs.list` returns the run
- [ ] `runs.get` returns correct fields (id, agentId, taskId, status, duration)
- [ ] `runs.appendLog` persists log entries
- [ ] `runs.getLogs` returns entries in insertion order
- [ ] Full status lifecycle completes without error
