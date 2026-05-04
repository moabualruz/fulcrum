---
Status: ready-for-agent
Phase: P5
Priority: medium
Test-file: tests/inference/sidecar-lifecycle.test.ts
Framework: bun-test
Blocked-by: []
---

# Inference Sidecar Start/Stop Lifecycle

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Integration test that starts and stops the inference sidecar and verifies the health endpoint responds correctly. No test currently exists.

## Setup

- Isolated `FULCRUM_HOME` tmpdir
- Random port to avoid conflicts
- Timeout: 30s for sidecar start

## Steps

1. Call sidecar start function (or spawn process)
2. Poll health endpoint until 200 or timeout
3. Verify health response JSON shape
4. Call sidecar stop function
5. Verify health endpoint returns connection refused or 404

## Assertions

- [ ] Sidecar starts within 30 seconds
- [ ] Health endpoint returns 200 with `{status: "ok"}` or equivalent
- [ ] Stop function terminates the sidecar process
- [ ] After stop, health endpoint is unreachable
- [ ] No zombie processes after stop
