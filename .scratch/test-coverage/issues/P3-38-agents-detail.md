---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/agents.spec.ts
Framework: playwright
Blocked-by: [P3-04]
---

# /agents/[name] — Agent Profile Detail E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for agent profile detail page. No unit test (`page.server.test.ts` missing) and no e2e currently exist.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 1 agent profile with capabilities, run history
- Shares spec file with P3-04

## Steps

1. Navigate to `/agents/<name>`
2. Verify profile header: name, version, description
3. Verify capabilities list
4. Verify recent runs section (last 5 runs)
5. Click "Edit Profile" → profile edit form opens
6. Change description → save → persists

## Assertions

- [ ] Agent profile detail page renders without error (no `page.server.test.ts`)
- [ ] Name, version, description displayed
- [ ] Capabilities list rendered
- [ ] Recent runs shown
- [ ] Edit profile works and persists changes
- [ ] No console errors
