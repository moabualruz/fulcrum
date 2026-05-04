---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/memory.spec.ts
Framework: playwright
Blocked-by: [P3-07]
---

# /memory/[id] — Memory Detail View E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for individual memory detail view. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 1 memory entry with source run ID and project association
- Shares spec file with P3-07

## Steps

1. Navigate to `/memory/<id>`
2. Verify detail view renders full content
3. Verify source run link present and clickable
4. Verify importance level shown
5. Verify project association shown
6. Edit importance level → save → persists
7. Delete memory → redirect to list → memory gone

## Assertions

- [ ] Detail view renders all memory fields
- [ ] Source run link navigates to run detail
- [ ] Edit importance works and persists
- [ ] Delete navigates back to list
- [ ] Deleted memory not visible in list
