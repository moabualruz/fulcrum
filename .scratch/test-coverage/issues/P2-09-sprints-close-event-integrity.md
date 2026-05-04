---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/sprints-close.test.ts
Framework: bun-test
Blocked-by: [P2-08]
---

# Sprint Close Event Integrity

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies that the `sprint.closed` event persisted after `sprints.close` contains a `metrics_snapshot.id` that is a non-empty UUID. Gate review found empty UUID (F1-B — fixed). This test is a regression guard.

## Setup

- Shares test setup with P2-08 (same test file)
- Active sprint with completed and incomplete tasks

## Steps

1. Call `sprints.close` on an active sprint
2. Query the `events` table for the `sprint.closed` event
3. Parse the event payload JSON
4. Check `payload.metrics_snapshot.id`
5. Cross-reference the ID against the metrics row in the DB

## Assertions

- [ ] Event with type `sprint.closed` exists in `events` table after close
- [ ] `payload.metrics_snapshot.id` is a non-empty string
- [ ] `payload.metrics_snapshot.id` is a valid UUID format
- [ ] A metrics row with that ID exists in the DB
- [ ] `metrics_snapshot.completed` count matches actual completed task count
