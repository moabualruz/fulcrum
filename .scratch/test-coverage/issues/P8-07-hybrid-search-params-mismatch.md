---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P2-10]
---

# Regression: F1-D — Hybrid Search Params/SQL Mismatch

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F1-D: `src/search/query.ts:360` — FTS WHERE clause used `$2` for a timestamp parameter where the query text was expected. Fixed. Verify correct param binding.

## Setup

- PGlite with `search_documents` populated
- Mock `embedQuery` returning fixed vector

## Steps

1. Call `queryHybridSearchDocuments` with `q="deployment"` and mock embedQuery
2. Capture SQL and params used (via spy or inspect)
3. Verify param at FTS placeholder position is the string "deployment"
4. Verify result contains documents with "deployment" content
5. Verify result does NOT contain unrelated documents

## Assertions

- [ ] FTS WHERE placeholder bound to query text "deployment" (not a timestamp)
- [ ] Query returns relevant documents
- [ ] Query excludes irrelevant documents
- [ ] No SQL execution error
