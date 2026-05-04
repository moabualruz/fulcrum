---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-08.spec.ts
Framework: playwright
Blocked-by: [P6-02]
---

# J08: Backup + Restore Round-Trip

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: create data → CLI backup → delete data → CLI restore → verify via web. Maps to USER-JOURNEYS.md J08.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config

## Steps

1. Create: 1 project, 3 tasks, 2 docs, 1 memory via web and CLI
2. CLI: `fulcrum backup --output /tmp/fulcrum-backup.tar.gz`
3. Delete `FULCRUM_HOME` state (rm -rf DB)
4. CLI: `fulcrum restore --input /tmp/fulcrum-backup.tar.gz`
5. Web: dashboard shows same project/task/doc counts
6. CLI: `fulcrum tasks list --json` → task titles match pre-backup

## Assertions

- [ ] Backup creates non-empty archive
- [ ] Backup prints entity counts
- [ ] Restore exits 0
- [ ] Web dashboard shows restored counts
- [ ] Task titles preserved (data integrity)
- [ ] No orphaned references after restore
