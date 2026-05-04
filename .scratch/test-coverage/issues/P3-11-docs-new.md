---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/docs.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-13]
---

# /docs/new — New Document Creation Flow E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for new document creation flow end-to-end. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- No seed needed (tests creation from empty state)

## Steps

1. Navigate to `/docs/new`
2. Verify creation form renders (title input, type selector, project selector)
3. Enter title "Test Doc"
4. Select type "decision"
5. Select project (if project exists)
6. Click "Create" → redirects to `/docs/<id>/edit`
7. Verify editor loads with template body if template configured

## Assertions

- [ ] New doc form renders with all fields
- [ ] Title input accepts text
- [ ] Type selector shows available types
- [ ] Create button redirects to editor
- [ ] Editor URL contains the new document's ID
- [ ] Template body applied (if org default template configured)
