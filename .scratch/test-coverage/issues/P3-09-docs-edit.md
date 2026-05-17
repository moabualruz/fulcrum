---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/docs.spec.ts
Framework: playwright
Blocked-by: [P1-02, P2-02]
---

# /docs/[id]/edit — Tiptap Editor Save/Cancel E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for the Tiptap document editor save/cancel round-trip through the real workflow, real runtime connection, and seeded DB. No e2e currently exists.

## Setup

- Dev server via Playwright `webServer` config
- Seed: 1 existing document
- Shares spec file with P3-08

## Steps

1. Navigate to `/docs/<id>/edit`
2. Verify Tiptap editor loads with existing content
3. Type additional text in editor
4. Press Ctrl+S → verify save indicator appears (spinner → checkmark)
5. Reload page → verify edited text persisted
6. Make another edit → click "Cancel" → verify content reverted to saved state

## Assertions

- [ ] Editor loads with existing document content
- [ ] Content change triggers dirty state indicator
- [ ] Ctrl+S saves and shows confirmation
- [ ] Content persists across page reload
- [ ] Cancel reverts to last saved state
- [ ] No console errors during edit/save cycle
