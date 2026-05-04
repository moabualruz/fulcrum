---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/boards.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /boards — Standalone Boards View E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for standalone boards view. Unit tests exist but no e2e.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 2 projects with tasks in varied statuses

## Steps

1. Navigate to `/boards`
2. Verify kanban board renders with columns (Todo, In Progress, Done)
3. Verify tasks appear in correct columns
4. Drag a task from "Todo" to "In Progress" column
5. Verify task status updated in DB (check via API)
6. Filter by project → only that project's tasks shown

## Assertions

- [ ] Boards page renders with kanban columns
- [ ] Tasks in correct columns per status
- [ ] Drag-and-drop updates task status
- [ ] Status change persists (verified via reload)
- [ ] Project filter works
- [ ] No console errors
