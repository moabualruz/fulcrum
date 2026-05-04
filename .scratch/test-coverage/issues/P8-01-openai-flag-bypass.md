---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P5-04]
---

# Regression: CF-01 — OpenAI Backend Flag Bypass

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for CF-01: `src/inference/backends/client.ts:97` — `flagEnabled` was hardcoded `true`, allowing OpenAI-compatible backend regardless of flag state. Fixed. Test ensures fix holds.

## Setup

- Import `src/inference/backends/client.ts` under test
- Feature flag store mock with `external-llm-provider` OFF

## Steps

1. Set `external-llm-provider` flag to OFF
2. Attempt to instantiate or use the OpenAI-compatible backend
3. Verify request is rejected (not forwarded)
4. Set flag ON → verify request proceeds

## Assertions

- [ ] With flag OFF: backend usage throws or returns error
- [ ] `flagEnabled` reads from flag store, not hardcoded `true`
- [ ] With flag ON: backend usage proceeds normally
