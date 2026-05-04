---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/runs.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-01]
---

# /runs/[id]/artifacts — Run Artifact Viewer E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for run-scoped artifact viewer. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- Seed: run with 3 artifacts (1 text file, 1 JSON, 1 binary)

## Steps

1. Navigate to `/runs/<id>/artifacts`
2. Verify artifact list renders with 3 items
3. Each item shows: filename, MIME type, size
4. Click text artifact → inline preview renders
5. Click JSON artifact → formatted JSON preview
6. Click binary artifact → "Binary file" placeholder shown
7. Click download button → download starts

## Assertions

- [ ] Artifact list renders with correct count
- [ ] Text/JSON artifacts have inline preview
- [ ] Binary artifacts show placeholder
- [ ] Download buttons trigger downloads
- [ ] No console errors
