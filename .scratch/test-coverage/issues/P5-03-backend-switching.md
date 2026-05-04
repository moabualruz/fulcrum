---
Status: ready-for-agent
Phase: P5
Priority: medium
Test-file: tests/inference/backend-switching.test.ts
Framework: bun-test
Blocked-by: [P5-01]
---

# Inference Backend Switching

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Integration test that switches between embedded/ollama/lm-studio/openai-compatible backends and verifies request routing changes accordingly.

## Setup

- Mock backend servers (use `page.route()` or local HTTP mock server) for each backend type
- Backend config store with writable test fixture

## Steps

1. Configure backend to "embedded" → send inference request → verify routes to embedded endpoint
2. Switch to "ollama" → send inference request → verify routes to ollama endpoint (localhost:11434)
3. Switch to "lm-studio" → verify routes to lm-studio endpoint (localhost:1234)
4. Switch to "openai-compatible" with custom URL → verify routes to custom URL
5. Revert to "embedded" → verify original routing restored

## Assertions

- [ ] Each backend type routes to correct endpoint
- [ ] Backend switch takes effect immediately (or after config save)
- [ ] No cross-backend routing (ollama request never hits embedded endpoint)
- [ ] Custom URL for openai-compatible backend is used
