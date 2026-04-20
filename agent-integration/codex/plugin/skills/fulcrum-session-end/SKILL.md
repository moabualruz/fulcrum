---
name: fulcrum-session-end
description: Complete or hand off the Fulcrum agent run at end of session
---
# Session End

Before closing a session:

1. If work is **complete**: call `fulcrum action exec complete_agent_run` with `run_id` and a concise `summary` of what was accomplished. Include `artifact_paths` for any files changed.
2. If work is **blocked**: call `fulcrum action exec block_agent_run` with `run_id` and a clear `reason` explaining exactly what is blocking.
3. If handing off to another agent: write a memory entry with `fulcrum action exec write_memory` summarizing current state, decisions made, and next steps.

**Always close the run.** An unclosed run blocks WIP capacity and confuses the next agent in the chain.
