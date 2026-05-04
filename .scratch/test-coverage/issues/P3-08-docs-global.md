---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/docs.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-02]
---

# /docs/global — Global Docs Listing E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for global docs listing page. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 4 documents with varied types (decision, runbook, note, wiki)

## Steps

1. Navigate to `/docs/global`
2. Verify document list renders with 4 items
3. Filter by type "decision" → only decision docs shown
4. Click on document → navigates to document detail/editor
5. Click "New Document" → navigates to `/docs/new`

## Assertions

- [ ] Global docs list renders with seeded documents
- [ ] Each item shows title, type badge, last-modified date
- [ ] Type filter narrows list
- [ ] Clicking document navigates to correct route
- [ ] "New Document" button navigates to new-doc flow
- [ ] No console errors
