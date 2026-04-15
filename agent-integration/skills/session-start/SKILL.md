---
name: session-start
description: Initialize a Fulcrum agent run at the start of every working session
allowed-tools:
  - mcp__fulcrum__get_current_context
  - mcp__fulcrum__get_workspace_status
  - mcp__fulcrum__start_agent_run
  - mcp__fulcrum__recall_memory
---

# Session Start

At the start of every working session:

1. Call `mcp__fulcrum__get_current_context` (no parameters) to obtain `workspace_id` and `project_id`, then call `mcp__fulcrum__get_workspace_status` with that `workspace_id` to understand current state.
2. If a task is assigned, call `mcp__fulcrum__start_agent_run` with your `agent_role`, `workspace_id`, and `task_id`.
3. Store the returned `run_id` — include it in all subsequent heartbeats and completions.
4. Call `mcp__fulcrum__recall_memory` for the current task to surface any relevant prior decisions.

**Never skip this.** Without a run_id, heartbeat, memory recall, and completion tracking are all inert.
