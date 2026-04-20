---
name: fulcrum-session-start
description: Initialize a Fulcrum agent run at the start of every working session
---
# Session Start

At the start of every working session:

1. Call `fulcrum action exec get_current_context` (no parameters) to obtain `workspace_id` and `project_id`, then call `fulcrum action exec get_workspace_status` with that `workspace_id` to understand current state.
2. If a task is assigned, call `fulcrum action exec start_agent_run` with your `agent_role`, `workspace_id`, and `task_id`.
3. Store the returned `run_id` — include it in all subsequent heartbeats and completions.
4. Call `fulcrum action exec recall_memory` for the current task to surface any relevant prior decisions.

```bash
fulcrum action exec get_current_context
fulcrum action exec get_workspace_status --json '{"workspace_id":"ws_123"}'
fulcrum action exec start_agent_run --json '{"workspace_id":"ws_123","task_id":"task_123","agent_role":"software_engineer"}'
fulcrum action exec recall_memory --json '{"workspace_id":"ws_123","query":"current task"}'
```

**Never skip this.** Without a run_id, heartbeat, memory recall, and completion tracking are all inert.
