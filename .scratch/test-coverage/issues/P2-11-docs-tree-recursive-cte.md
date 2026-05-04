---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/docs-tree.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# docs.tree Recursive CTE

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Integration test for the `docs.tree` procedure, which uses a recursive CTE to build nested document trees. Gate review found this procedure missing entirely from the docs router (spec gap — not yet implemented). This test documents the expected behavior to drive implementation.

## Setup

- PGlite with migrations via `createTestDb()`
- Default org via `createLocalOrg()`
- Seed documents with parent-child relationships: root → folder → leaf

## Steps

1. Create root document (parent_id=null)
2. Create folder document (parent_id=root)
3. Create leaf document (parent_id=folder)
4. Call `docs.tree` → verify nested structure returned
5. Call `docs.tree` with depth limit → verify truncated result
6. Delete folder document → verify leaf becomes orphaned or cascades

## Assertions

- [ ] `docs.tree` returns nested structure (root → children → grandchildren)
- [ ] Each node has `id`, `title`, `children` array
- [ ] Depth limit parameter limits nesting level
- [ ] Empty tree returned for org with no documents
