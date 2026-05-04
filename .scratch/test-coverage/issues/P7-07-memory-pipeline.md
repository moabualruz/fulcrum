---
Status: ready-for-agent
Phase: P7
Priority: low
Test-file: tests/e2e/journey-07.spec.ts
Framework: playwright
Blocked-by: [P3-07, P3-37, P2-03, P6-01]
---

# J07: Memory + Context Pipeline

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Cross-surface: agent run produces memory → visible in web → retrieved by next run → CLI access. Maps to USER-JOURNEYS.md J07.

## Setup

- Fresh `FULCRUM_HOME` tmpdir
- Dev server via Playwright `webServer` config
- Agent with memory extraction enabled

## Steps

1. Trigger agent run that produces a memory fact "Project uses TypeScript + Bun"
2. Web: `/memory` → memory list shows the fact
3. Web: click → detail view shows source (run ID), importance, content
4. CLI: `fulcrum memory list --json` → fact appears
5. CLI: `fulcrum memory search "TypeScript" --json` → returns the fact
6. Trigger another agent run → context assembler includes the memory

## Assertions

- [ ] Extraction produces memory entry
- [ ] Memory visible in web list and detail
- [ ] CLI retrieves and searches memories
- [ ] Context assembler includes relevant memories in next run
