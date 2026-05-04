---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/agents.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /agents — Agent Profile List E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for agent profile list, test-profile action, and dispatch-run flow.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 2 agent profiles in DB

## Steps

1. Navigate to `/agents`
2. Verify agent profile cards render
3. Click on agent → navigates to `/agents/[name]`
4. Verify profile detail page shows name, capabilities, last run
5. Click "Test profile" → validation modal appears
6. Click "Dispatch" → dispatch modal with task selector appears

## Assertions

- [ ] Agent list renders with seeded profiles
- [ ] Each card shows agent name, status, last-run time
- [ ] Profile detail page renders correctly
- [ ] "Test profile" action opens validation UI
- [ ] "Dispatch" action opens run modal with task selector
- [ ] No console errors on navigation
