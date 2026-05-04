---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/hybrid-search.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# Hybrid Search Params Correctness

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Integration test verifying that `queryHybridSearchDocuments` FTS WHERE clause params match the SQL placeholders. Gate review found params/SQL mismatch where `$2` resolved to a timestamp instead of the query text (F1-D — fixed). Regression guard.

## Setup

- PGlite with `search_documents` table populated
- 10 documents with varied content
- Mock `embedQuery` function that returns a fixed vector

## Steps

1. Call `queryHybridSearchDocuments` with `q="deploy"` and mock `embedQuery`
2. Capture the SQL and params array used internally
3. Verify `$2` in WHERE clause corresponds to query text `"deploy"`, not a timestamp
4. Results contain documents mentioning "deploy"
5. Results do NOT contain unrelated documents

## Assertions

- [ ] Params array positionally matches WHERE clause placeholders
- [ ] `$2` resolves to query text string, not a `now()` timestamp value
- [ ] Result set contains documents with "deploy" content
- [ ] Result set excludes documents without matching content
- [ ] Query executes without error
