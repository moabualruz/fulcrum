---
Status: ready-for-agent
Phase: P3
Priority: high
Test-file: src/web/tests/e2e/inference.spec.ts
Framework: playwright
Blocked-by: [P1-02]
---

# /inference — Inference Sidecar Dashboard E2E

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Playwright e2e for inference sidecar dashboard, start/stop actions, backend config.

## Setup

- Dev server via Playwright `webServer` config
- Mock inference sidecar health endpoint (or use real one if available)

## Steps

1. Navigate to `/inference`
2. Verify sidecar status dashboard renders
3. Verify backend selector shows available backends (embedded, ollama, lm-studio, openai-compatible)
4. Click "Start" → status changes to running (or shows error if no backend)
5. Click "Stop" → status changes to stopped
6. Change backend config → save → setting persisted

## Assertions

- [ ] Inference dashboard renders without 500
- [ ] Backend selector shows all supported backends
- [ ] Start/stop controls are clickable
- [ ] Backend config change is saveable
- [ ] Status indicator reflects actual sidecar state
