---
Status: ready-for-agent
Phase: P5
Priority: medium
Test-file: tests/inference/openai-flag-gate.test.ts
Framework: bun-test
Blocked-by: [P5-03]
---

# Inference OpenAI-Compatible Backend Feature Flag Gate

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies the OpenAI-compatible backend respects the `external-llm-provider` feature flag. Gate review found the flag was bypassed (`flagEnabled` always `true`, CF-01 — fixed). Regression test.

## Setup

- Feature flag store mock
- `src/inference/backends/client.ts` under test

## Steps

1. Set `external-llm-provider` flag to OFF
2. Attempt to use OpenAI-compatible backend
3. Verify request is rejected with "Feature not enabled" error (not forwarded to external URL)
4. Set `external-llm-provider` flag to ON
5. Attempt same request → verify forwarded to external URL
6. Verify `flagEnabled` reads from the feature flag store (not hardcoded `true`)

## Assertions

- [ ] OpenAI-compatible backend blocked when flag is OFF (regression for CF-01)
- [ ] Appropriate error returned (not silent failure)
- [ ] Request forwarded when flag is ON
- [ ] `flagEnabled` reads actual flag value, not hardcoded `true`
