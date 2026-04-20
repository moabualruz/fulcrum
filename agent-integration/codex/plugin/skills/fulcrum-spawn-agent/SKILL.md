---
name: fulcrum-spawn-agent
description: Start a new agent run for a specific role and task
---
# Spawn Agent

To start a new agent run:

1. Confirm the task exists: call `fulcrum action exec list_tasks` and find the target `task_id`.
2. Call `fulcrum action exec start_agent_run` with `workspace_id`, `task_id`, `agent_role` (the role to launch), and optionally `model` (defaults to role definition's model).
3. Record the new `run_id` returned. Pass it to the spawned agent's context if coordinating handoff.
4. Monitor via `fulcrum action exec get_agent_run_status` with the `run_id` to track progress.

**Check WIP limits first.** `fulcrum action exec get_workspace_status` returns `wip_headroom` — if it's 0, the spawn will be rejected by policy.
