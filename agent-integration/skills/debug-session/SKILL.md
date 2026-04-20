---
name: debug-session
description: Structured debugging of failing test or unexpected behavior.
---

# Debug Session

Debug systematically:

1. **Reproduce**: confirm failure deterministic. Run failing test/command in isolation.
2. **Recall**: `fulcrum action exec recall_memory` for failing component — known issues, prior fixes, invariants.
3. **Localize**: form hypothesis. One assumption at a time. No multi-change swings.
4. **Instrument**: minimal logging/assertions to confirm/refute.
5. **Fix**: minimal change addressing root cause. No symptom fixes.
6. **Guard**: add/update test to catch regression.
7. **Record**: `fulcrum action exec write_memory` (`kind: "error"`) — root cause + fix for future agents.

**Do not guess.** Each step produces evidence. Fix without confirmed root cause = guess.
