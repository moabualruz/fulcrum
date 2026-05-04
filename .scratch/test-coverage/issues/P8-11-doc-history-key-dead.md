---
Status: ready-for-agent
Phase: P8
Priority: high
Test-file: tests/regressions/gate-findings.test.ts
Framework: bun-test
Blocked-by: [P4-02]
---

# Regression: F03 — Doc History 'h' Key Dead

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Regression test for F03: `src/tui/screens/docs-reader-editor.ts:66` — pressing 'h' in the docs reader/editor did not open the history panel. Fixed. Verify 'h' opens history.

## Setup

- DocsReaderEditor screen with FakeTTY
- Document with version history seeded

## Steps

1. Render DocsReaderEditor in view mode
2. Inject key event 'h'
3. Verify key handler returns `true` (handled)
4. Inspect rendered output for history panel indicator

## Assertions

- [ ] 'h' key handler registered and returns `true`
- [ ] History panel state set to open after 'h' press
- [ ] Rendered output includes history panel content
- [ ] 'h' in edit mode does NOT open history (only in view mode, if applicable)
