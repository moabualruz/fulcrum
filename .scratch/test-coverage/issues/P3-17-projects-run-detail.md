---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/projects.spec.ts
Framework: playwright
Blocked-by: [P3-16]
---

# /projects/[id]/runs/[runId] — Run Detail Within Project E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for run detail page within a project context. No unit test and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: project with 1 completed run that has logs and artifacts

## Steps

1. Navigate to `/projects/<id>/runs/<runId>`
2. Verify run detail renders: status, duration, agent name, task name
3. Verify log output section shows log lines
4. Click "Artifacts" tab → artifact list renders
5. Verify breadcrumb shows project → runs → this run

## Assertions

- [ ] Run detail renders with correct fields
- [ ] Log output is present
- [ ] Artifacts tab shows attached artifacts
- [ ] Breadcrumb navigation is correct
- [ ] No console errors
