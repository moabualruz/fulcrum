---
name: fulcrum-session-end
description: Complete or hand off Fulcrum agent run at end of session.
---
# Session End

Before closing session:

1. Work **complete**: `fulcrum action exec complete_agent_run` with `run_id` + concise `summary`. Include `artifact_paths` for files changed.
2. Work **blocked**: `fulcrum action exec block_agent_run` with `run_id` + clear `reason` (exactly what blocks).
3. Handing off to another agent: `fulcrum action exec write_memory` summarizing state, decisions, next steps.

**Always close the run.** Unclosed run blocks WIP + confuses next agent.
