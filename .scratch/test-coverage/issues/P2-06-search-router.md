---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/search.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Search Router Integration Test

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

tRPC integration test for the `search` router — search-across-entities procedure. No integration test currently exists.

## Setup

- PGlite with all migrations via `createTestDb()`
- Default org via `createLocalOrg()`
- Seed: 3 tasks, 2 docs, 1 memory with varied content

## Steps

1. Index entities into `search_documents` table after seeding
2. Call `search.query` with a term matching only one task title
3. Verify result set contains that task, not others
4. Call `search.query` with a term that spans tasks and docs
5. Verify both entity types returned
6. Call `search.query` with empty string → verify empty results or error

## Assertions

- [ ] `search.query` returns correct entity type labels (task, document, memory)
- [ ] Scoped search returns only matching entities
- [ ] Cross-entity search returns all matching types
- [ ] No unrelated entities appear in results
