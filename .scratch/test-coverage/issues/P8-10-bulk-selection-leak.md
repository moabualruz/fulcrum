---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P4-03]
---

# Regression: F01 — Bulk Selection Not Cleared After Update

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F01: `src/tui/screens/task-list.ts:142` — bulk selection set not cleared after bulk status update. Fixed. Verify selection clears.

## Setup

- TaskListScreen with FakeTTY
- 5 tasks in test fixture
- Shares test setup with P4-03

## Steps

1. Select 3 tasks via Space key
2. Open bulk menu (B)
3. Execute bulk status update → all 3 updated
4. Inspect `screen.selectedIds` (or rendered output)

## Assertions

- [ ] `selectedIds` is empty after bulk update completes
- [ ] No selection highlights in re-rendered output
- [ ] Selected count indicator shows 0
- [ ] Subsequent Space presses start fresh selection
