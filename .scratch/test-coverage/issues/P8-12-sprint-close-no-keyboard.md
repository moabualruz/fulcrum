---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P4-02]
---

# Regression: F04 — Sprint Close Overlay No Keyboard Handler

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F04: `src/tui/screens/sprints.ts:201` — sprint close overlay had no keyboard handler. Fixed. Verify keyboard works in close overlay.

## Setup

- SprintsScreen with FakeTTY
- Active sprint in test fixture

## Steps

1. Render SprintsScreen
2. Inject 'C' key → close overlay opens
3. Inject 'b' key → backlog disposition selected
4. Inject 'n' key → next-sprint disposition selected
5. Inject 'q' key → overlay closes (not whole screen)

## Assertions

- [ ] 'C' key opens close overlay
- [ ] 'b' selects backlog disposition
- [ ] 'n' selects next-sprint disposition
- [ ] 'q' closes overlay (not the entire screen)
- [ ] All key handlers return `true` (events handled)
