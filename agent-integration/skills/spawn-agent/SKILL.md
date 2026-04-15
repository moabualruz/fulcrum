---
name: spawn-agent
description: Start a new agent run for a specific role and task
allowed-tools:
  - mcp__fulcrum__list_tasks
  - mcp__fulcrum__start_agent_run
  - mcp__fulcrum__get_agent_run_status
  - mcp__fulcrum__get_workspace_status
---

# Spawn Agent

To start a new agent run:

1. Confirm the task exists: call `mcp__fulcrum__list_tasks` and find the target `task_id`.
2. Call `mcp__fulcrum__start_agent_run` with `workspace_id`, `task_id`, `agent_role` (the role to launch), and optionally `model` (defaults to role definition's model).
3. Record the new `run_id` returned. Pass it to the spawned agent's context if coordinating handoff.
4. Monitor via `mcp__fulcrum__get_agent_run_status` with the `run_id` to track progress.

**Check WIP limits first.** `mcp__fulcrum__get_workspace_status` returns `wip_headroom` — if it's 0, the spawn will be rejected by policy.
