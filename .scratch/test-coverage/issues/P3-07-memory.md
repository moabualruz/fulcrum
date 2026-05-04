---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/memory.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-03]
---

# /memory — Memory List/Detail E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for memory list and detail views. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 5 memory entries with varied content and importance

## Steps

1. Navigate to `/memory`
2. Verify memory list renders with 5 items
3. Each item shows content snippet, importance, source
4. Click on memory → navigates to `/memory/[id]`
5. Verify detail view shows full content, source run link, importance level
6. Filter by project → only project-scoped memories shown

## Assertions

- [ ] Memory list renders with seeded entries
- [ ] Each entry shows content, importance badge, timestamp
- [ ] Detail view renders at `/memory/[id]`
- [ ] Source run link is clickable and navigates to run
- [ ] Project filter narrows list correctly
- [ ] No console errors
