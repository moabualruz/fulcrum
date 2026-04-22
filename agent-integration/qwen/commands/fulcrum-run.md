---
description: Start, check, or complete a Fulcrum agent run
argument-hint: "[start <role> | status <run_id> | complete <run_id>]"
---

Parse `$ARGUMENTS`:
- `start <role>` — call `get_current_context` to obtain `workspace_id`, then call `start_agent_run` with that `workspace_id` and the given `agent_role`. Report the new `run_id`.
- `status <run_id>` — call `get_agent_run_status` with the given `run_id`. Show status, heartbeat age, and any blockers.
- `complete <run_id>` — call `complete_agent_run` with the given `run_id` and a summary of what was done.
- No arguments — call `get_workspace_status` and list all active runs.
