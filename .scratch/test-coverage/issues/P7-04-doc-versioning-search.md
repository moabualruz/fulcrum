---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-04.spec.ts
Framework: playwright
Blocked-by: [P3-09, P3-10, P2-02]
---

# J04: Document Creation + Versioning + Search

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: create doc via web → version history → CLI list → search from CLI and web. Maps to USER-JOURNEYS.md J04.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config

## Steps

1. Web: create doc "Architecture" (type: decision)
2. Web: edit → type "## Overview\nThis is our architecture doc" → save
3. Web: edit again → add "## Database\nWe use PGlite locally" → save
4. Web: `/docs/<id>/history` → v1 and v2 listed with diff
5. CLI: `fulcrum docs list --json` → "Architecture" doc present
6. CLI: `fulcrum search "PGlite" --json` → Architecture doc in results
7. Web: search "PGlite" → Architecture doc appears, click navigates to doc

## Assertions

- [ ] Doc saved with content
- [ ] Version history shows 2 versions
- [ ] Diff viewer shows changes between v1 and v2
- [ ] CLI lists the doc
- [ ] CLI and web search both find "PGlite" content
