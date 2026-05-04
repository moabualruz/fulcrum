---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/memories.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Memories Router Integration Test

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

tRPC integration test for the `memories` router CRUD procedures. No integration test currently exists.

## Setup

- PGlite with all migrations via `createTestDb()`
- Default org and project created via `createLocalOrg()`
- tRPC caller from server context

## Steps

1. Call `memories.create` with content, importance, source run ID
2. Call `memories.list` → verify memory appears
3. Call `memories.get` by ID → verify fields
4. Call `memories.update` → change importance and content
5. Call `memories.delete` → verify removed
6. Call `memories.search` with query text → verify relevant memory returned

## Assertions

- [ ] `memories.create` returns memory with valid UUID
- [ ] `memories.list` returns created memory
- [ ] `memories.get` returns correct fields (id, content, importance, projectId)
- [ ] `memories.update` persists changes
- [ ] `memories.delete` removes memory
- [ ] `memories.search` returns matching memory (not unrelated ones)
