---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-12.spec.ts
Framework: playwright
Blocked-by: [P3-15, P2-06]
---

# J12: Multi-Project Routing

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: configure routing rules → incoming task auto-assigned to correct project. Maps to USER-JOURNEYS.md J12.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- 2 projects: "bugs" and "features"

## Steps

1. Web: `/projects/bugs/routing` → add rule: if title contains "bug" → assign to "bugs" project
2. Web: `/projects/features/routing` → add rule: if title contains "feat" → assign to "features" project
3. CLI: `fulcrum tasks create --title "Fix login bug" --json` → auto-assigned to "bugs"
4. CLI: `fulcrum tasks create --title "Add dark mode feat" --json` → auto-assigned to "features"
5. Web: bugs project board → "Fix login bug" present
6. Web: features project board → "Add dark mode feat" present

## Assertions

- [ ] Routing rules saved for both projects
- [ ] Task matching "bug" rule assigned to bugs project
- [ ] Task matching "feat" rule assigned to features project
- [ ] Task without matching rule goes to default/inbox
