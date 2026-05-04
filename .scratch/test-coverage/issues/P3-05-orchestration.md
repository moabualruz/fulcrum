---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/orchestration.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-04]
---

# /orchestration — Run Queue Dashboard E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for run queue dashboard, cancel/retry actions.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 3 runs (1 queued, 1 running, 1 completed)

## Steps

1. Navigate to `/orchestration`
2. Verify run queue dashboard renders with 3 runs
3. Verify status badges for each run
4. Click "Cancel" on queued run → confirm dialog appears → confirm → status changes to cancelled
5. Click "Retry" on cancelled run → run re-queued
6. Click into a completed run → navigates to run detail

## Assertions

- [ ] Queue dashboard renders with runs
- [ ] Status badges show correct colors/labels
- [ ] Cancel action changes status to `cancelled`
- [ ] Retry action re-queues the run
- [ ] Navigation to run detail works
- [ ] No console errors
