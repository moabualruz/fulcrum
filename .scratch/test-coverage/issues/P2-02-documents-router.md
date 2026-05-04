---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/documents.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Documents Router Integration Test

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

tRPC integration test for the `documents` router procedures. The `docs-crud` tests cover some surface but the `documents` router has its own procedures not covered.

## Setup

- PGlite with all migrations via `createTestDb()`
- Default org created via `createLocalOrg()`
- tRPC caller from server context

## Steps

1. Call `documents.create` with title, body, type
2. Call `documents.list` → verify document appears
3. Call `documents.get` by ID → verify fields
4. Call `documents.update` → change title and body
5. Call `documents.delete` → verify removed
6. Call `documents.versions` → verify version history has entries

## Assertions

- [ ] `documents.create` returns document with valid UUID
- [ ] `documents.list` returns created document
- [ ] `documents.get` returns correct fields (id, title, body, type, createdAt)
- [ ] `documents.update` persists changes
- [ ] `documents.delete` removes document from list
- [ ] `documents.versions` returns at least 1 version after update
