---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/docs-tree.test.ts
Framework: bun-test
Blocked-by: [P2-11]
---

# docs.move Fractional Sort

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Integration test for the `docs.move` procedure, which uses fractional indexing to maintain document sort order. Gate review found this procedure missing from the docs router (spec gap). Test documents expected behavior to drive implementation.

## Setup

- PGlite with migrations via `createTestDb()`
- Shared with P2-11 test file
- 5 sibling documents seeded with fractional sort keys

## Steps

1. Create 3 sibling documents (A, B, C) with sort keys 0.25, 0.5, 0.75
2. Call `docs.move` to move C before A → new sort key between 0.0 and 0.25
3. Verify new ordering: C, A, B when sorted by sort key
4. Move A to end → sort key after 0.75
5. Verify: C, B, A
6. Trigger rebalance by creating many moves → verify sort keys don't collapse to equal values

## Assertions

- [ ] `docs.move` updates `sort_key` to correct fractional value
- [ ] Ordering after move matches expected sequence
- [ ] Sort keys remain distinct (no two documents with same key)
- [ ] Rebalance fires when sort key precision exhausted
