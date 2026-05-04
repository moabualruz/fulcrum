---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/docs-create-template.test.ts
Framework: bun-test
Blocked-by: [P1-01]
---

# docs.create Template Application

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Verifies that `docs.create` applies the org-default template body when creating a document with a template reference. Gate review found no test for this (spec gap — not yet implemented). Test documents expected behavior.

## Setup

- PGlite with migrations via `createTestDb()`
- Default org via `createLocalOrg()`
- Create a task template with a body text `"## Summary\n{{title}}"` and set as org default

## Steps

1. Create a template with body `"## Summary\n{{title}}"` and set as org default for type `decision`
2. Call `docs.create` with `type="decision"` and `title="My Decision"`
3. Fetch the created document body
4. Verify body contains the template with `{{title}}` replaced with `"My Decision"`
5. Call `docs.create` without a template type → body is empty or freeform

## Assertions

- [ ] Created document body contains template text
- [ ] `{{title}}` placeholder replaced with actual title
- [ ] Document without template type has empty/null body
- [ ] Template version recorded in document metadata
