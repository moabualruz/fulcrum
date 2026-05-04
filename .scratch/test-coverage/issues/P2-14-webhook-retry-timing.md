---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/webhook-retry.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Webhook Retry Timing

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies that webhook delivery retries are separated by actual backoff delays, not fired synchronously. Gate review found all 5 retry attempts fired within milliseconds of each other (F-003). Regression guard.

## Setup

- PGlite with migrations via `createTestDb()`
- Webhook subscription and delivery row created
- Stub `fetch` to return 500 for first 3 calls, 200 for 4th

## Steps

1. Stub `fetch` to return HTTP 500 for attempts 1-3, HTTP 200 for attempt 4
2. Call `deliverWithRetry()` with the delivery ID
3. Record wall-clock timestamps of each `fetch` call
4. After completion, verify timing gaps between attempts

## Assertions

- [ ] Attempts are NOT all within 100ms of each other (regression: synchronous loop)
- [ ] Delay between attempt 1 and 2 matches exponential backoff schedule (e.g. ≥1s)
- [ ] Delay between attempt 2 and 3 is approximately 2× delay 1-2
- [ ] Final attempt returns 200 → delivery status = `delivered`
- [ ] `nextRetryAt` timestamps in DB match actual delay values
