---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: []
---

# Regression: CF-02 — pullModel Buffers All Progress

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for CF-02: `src/inference/client.ts:222` — `pullModel` buffers all progress events before yielding any. Architectural issue (not yet fixed). Test documents current behavior and will fail when fixed (flip assertions to guard).

## Setup

- Import `pullModel` from `src/inference/client.ts`
- Mock fetch with chunked responses (100ms between chunks)

## Steps

1. Mock fetch to send 5 progress chunks with 100ms delays
2. Start consuming `pullModel` async generator
3. Record timestamp of first yielded event
4. Compare against time of first mock chunk sent

## Assertions

- [ ] Test documents current buffering behavior (first event arrives after all chunks)
- [ ] After fix: first event arrives within 200ms of first chunk
- [ ] Progress events increase monotonically toward 100%
- [ ] No generator errors during consumption
