---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P2-04]
---

# Regression: CF-04 — Token Cap vs COMPLETE Ordering Ambiguity

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for CF-04: `src/orchestration/sandbox-runner.ts:310` — token cap hit and COMPLETE signal race condition. Open issue. Test verifies that hitting token cap results in a clean terminal state.

## Setup

- Sandbox runner under test with mocked token counting
- Run configured with token cap of 100 tokens

## Steps

1. Start a run that uses 90 tokens
2. Send COMPLETE signal
3. Verify run status is `completed` (not `token-cap-exceeded`)
4. Start another run that hits 100 tokens before COMPLETE
5. Verify run status is `token-cap-exceeded` (not `completed`)
6. Verify no intermediate `completed` state before `token-cap-exceeded`

## Assertions

- [ ] COMPLETE before token cap → status `completed`
- [ ] Token cap before COMPLETE → status `token-cap-exceeded`
- [ ] No ambiguous state where both reasons apply
- [ ] Exactly one terminal status per run
