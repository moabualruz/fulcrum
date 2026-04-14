---
name: escalate
description: Escalate a blocked run to the chief_of_staff with a clear reason
triggers:
  - stuck on a problem
  - cannot proceed without a decision
  - ambiguous requirements
---

# Escalate

When you are blocked and cannot proceed:

1. Stop working. Do not make progress on a wrong assumption.
2. Articulate the exact blocker in one sentence: what do you need to know or get to proceed?
3. Call `mcp__fulcrum__block_agent_run` with `run_id`, `reason` (the one-sentence blocker), and `escalation_reason` (why a human or chief_of_staff decision is required).
4. Surface any relevant context in the `reason` — what you tried, what the options are.

**Do not guess.** A wrong assumption costs more time than a short escalation. Block early, block clearly.
