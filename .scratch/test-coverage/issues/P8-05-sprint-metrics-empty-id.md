---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P2-08, P2-09]
---

# Regression: F1-B — Sprint Metrics ID Empty Before Flush

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F1-B: `src/server/trpc/routers/sprints.ts:294` — sprint metrics ID was empty before the DB flush completed. Fixed. Verify the ID is populated in the persisted event.

## Setup

- PGlite with migrations via `createTestDb()`
- Active sprint with tasks (shares setup with P2-09)

## Steps

1. Call `sprints.close` on active sprint
2. Query `events` table for `sprint.closed` event
3. Parse event payload
4. Verify `metrics_snapshot.id` field

## Assertions

- [ ] `metrics_snapshot.id` in event payload is non-empty
- [ ] `metrics_snapshot.id` is a valid UUID (36-character format)
- [ ] A metrics row with that exact UUID exists in the metrics table
- [ ] The metrics row has correct `completed` and `remaining` counts
