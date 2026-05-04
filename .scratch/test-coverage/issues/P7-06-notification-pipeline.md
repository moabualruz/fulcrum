---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-06.spec.ts
Framework: playwright
Blocked-by: [P3-02, P3-03, P2-03]
---

# J06: Notification Pipeline

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: create notification rule → trigger event via CLI → inbox shows notification → mark read → audit log. Maps to USER-JOURNEYS.md J06.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config

## Steps

1. Web: create notification rule: `event_pattern="task.*"`, channel=`in-app`
2. CLI: `fulcrum tasks create --title "Test task"` → task.created event fires
3. Web: `/inbox` → notification "Task created: Test task" appears
4. Web: bell badge shows 1
5. Web: click "Mark all read" → badge clears
6. Web: `/audit` → filter kind=task → task.created event shown
7. CLI: `fulcrum notifications list --json` → notification present

## Assertions

- [ ] Notification rule created and saved
- [ ] CLI task create triggers notification
- [ ] Inbox shows notification with correct message
- [ ] Bell badge count is accurate
- [ ] Mark-all-read clears badge
- [ ] Audit log records event
- [ ] CLI retrieves notification
