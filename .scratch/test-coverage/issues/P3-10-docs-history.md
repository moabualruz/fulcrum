---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/docs.spec.ts
Framework: playwright
Blocked-by: [P3-09]
---

# /docs/[id]/history — Version History Diff Viewer E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the document version history diff viewer. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- Seed: document with 3 versions (created by saving 3 times with different content)

## Steps

1. Navigate to `/docs/<id>/history`
2. Verify version list shows 3 entries with timestamps and authors
3. Click on v2 → diff view renders showing changes from v1→v2
4. Click on v3 → diff view updates for v2→v3
5. Click "Restore v1" → confirm dialog → document restored to v1 content

## Assertions

- [ ] Version list renders with correct count
- [ ] Each version shows timestamp and change summary
- [ ] Diff viewer renders added/removed text in different colors
- [ ] Switching versions updates diff view
- [ ] Restore action reverts document to selected version
- [ ] No console errors
