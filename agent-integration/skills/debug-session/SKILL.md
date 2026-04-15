---
name: debug-session
description: Structured approach to debugging a failing test or unexpected behavior
triggers:
  - test is failing
  - unexpected runtime behavior
  - error message not understood
version: 1.0.0
author: fulcrum
user-invocable: true
allowed-tools:
  - mcp__fulcrum__recall_memory
  - mcp__fulcrum__write_memory
  - Bash
  - Read
  - Grep
---

# Debug Session

To debug systematically:

1. **Reproduce**: confirm the failure is deterministic. Run the failing test/command in isolation.
2. **Recall**: `mcp__fulcrum__recall_memory` for the failing component — any known issues, prior fixes, or invariants.
3. **Localize**: form a hypothesis. Check one assumption at a time; don't change multiple things simultaneously.
4. **Instrument**: add minimal logging/assertions to confirm or refute the hypothesis.
5. **Fix**: make the minimal change that addresses the root cause. Do not fix symptoms.
6. **Guard**: add or update a test that would catch this regression.
7. **Record**: write a memory with `mcp__fulcrum__write_memory` (`kind: "error"`) documenting the root cause and fix for future agents.

**Do not guess.** Each step must produce evidence. A fix without a confirmed root cause is a guess.
