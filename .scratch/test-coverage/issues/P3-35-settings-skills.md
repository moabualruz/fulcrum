---
Status: ready-for-agent
Phase: P3
Priority: medium
Test-file: src/web/tests/e2e/settings-skills.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /settings/skills — Skill Browser/Install UI E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for skill browser and install UI. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- Use `page.route()` to mock skill registry API

## Steps

1. Navigate to `/settings/skills`
2. Verify skill browser renders with available skills
3. Click a skill → detail view shows name, description, version
4. Click "Install" → installation progress shown → skill marked "Installed"
5. Installed skill appears in "Installed" tab
6. Click "Uninstall" → skill removed from installed list

## Assertions

- [ ] Skill browser renders with available skills
- [ ] Skill detail view accessible
- [ ] Install flow works (even with mocked API)
- [ ] Installed tab reflects installed skills
- [ ] Uninstall removes from installed list
