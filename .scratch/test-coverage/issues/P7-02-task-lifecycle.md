---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-02.spec.ts
Framework: playwright
Blocked-by: [P3-12, P3-27, P6-01]
---

# J02: Project + Task Lifecycle

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: create task via CLI → visible on web board → update via web → visible in CLI. Maps to USER-JOURNEYS.md J02.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- Project pre-created via web UI steps

## Steps

1. Web: create project "My App" (slug "my-app")
2. Web: navigate to `/projects/my-app/board` → empty kanban
3. CLI: `fulcrum tasks create --title "Set up CI" --project my-app --json`
4. Web: refresh board → "Set up CI" in Todo column
5. Web: change task status to "In Progress"
6. CLI: `fulcrum tasks list --project my-app --json` → status is `in_progress`
7. CLI: `fulcrum tasks update <id> --status done`
8. Web: board refresh → task in Done column

## Assertions

- [ ] CLI-created task visible on web board
- [ ] Web status change reflected in CLI output
- [ ] CLI update reflected on web board
- [ ] Status transitions work bidirectionally
- [ ] Task count on project page updates correctly
