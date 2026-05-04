---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/artifacts.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Artifacts Router Integration Test

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

tRPC integration test for the `artifacts` router using real PGlite. Unit tests exist at `src/trpc/routers/artifacts.test.ts` but no integration test exercises the router against a real DB.

## Setup

- PGlite with all migrations via `createTestDb()`
- Default org and project created via `createLocalOrg()`
- tRPC caller created from the server context

## Steps

1. Call `artifacts.create` with a file reference and run ID
2. Call `artifacts.list` for the run → verify artifact appears
3. Call `artifacts.get` by ID → verify fields match
4. Call `artifacts.delete` by ID → verify removed from list
5. Call `artifacts.list` for non-existent run → verify empty array

## Assertions

- [ ] `artifacts.create` returns artifact with valid UUID
- [ ] `artifacts.list` returns the created artifact
- [ ] `artifacts.get` returns correct fields (id, runId, name, mimeType, size)
- [ ] `artifacts.delete` removes the artifact
- [ ] No DB errors during any operation
