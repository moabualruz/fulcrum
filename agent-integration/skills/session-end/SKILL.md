---
name: session-end
description: Complete or hand off the Fulcrum agent run at end of session
triggers:
  - session closing
  - work complete
  - handoff required
version: 1.0.0
author: fulcrum
---

# Session End

Before closing a session:

1. If work is **complete**: call `mcp__fulcrum__complete_agent_run` with `run_id` and a concise `summary` of what was accomplished. Include `artifact_paths` for any files changed.
2. If work is **blocked**: call `mcp__fulcrum__block_agent_run` with `run_id` and a clear `reason` explaining exactly what is blocking.
3. If handing off to another agent: write a memory entry with `mcp__fulcrum__write_memory` summarizing current state, decisions made, and next steps.

**Always close the run.** An unclosed run blocks WIP capacity and confuses the next agent in the chain.
