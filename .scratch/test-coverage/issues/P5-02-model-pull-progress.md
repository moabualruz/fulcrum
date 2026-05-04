---
Status: ready-for-agent
Phase: P5
Priority: medium
Test-file: tests/inference/model-pull.test.ts
Framework: bun-test
Blocked-by: [P5-01]
---

# Inference Model Pull Progress Streaming

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies `pullModel` yields real-time progress events instead of buffering all events before yielding. Gate review found it buffers all events (CF-02 — architectural issue). Test to document expected behavior and guard against regression once fixed.

## Setup

- Mock model download endpoint that sends chunked progress JSON
- Inject mock fetch into pullModel

## Steps

1. Mock fetch to return chunked responses with 100ms delays between chunks
2. Collect progress events as they arrive from `pullModel` async generator
3. Record timestamp of each event arrival
4. Compare arrival timestamps against chunk delivery times

## Assertions

- [ ] `pullModel` yields progress events before download completes
- [ ] First event arrives within 500ms of first chunk (not after all chunks)
- [ ] Progress percentage increases monotonically
- [ ] Final event shows 100% or "complete" status
- [ ] No buffering: events arrive incrementally, not all at once
