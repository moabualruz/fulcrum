---
name: team-status
description: Check the status of a running team instance
---

# Team Status

To check on a running team:

1. Call `fulcrum action exec list_team_instances` with `workspace_id` and optionally `project_id` to list active teams.
2. For a specific team, note the `instance_id` and inspect its `slots` for member run statuses.
3. For each slot's `run_id`, call `fulcrum action exec get_agent_run_status` to see heartbeat age and current step.
4. If any slot is blocked or stale (heartbeat > 30 min), escalate via `fulcrum action exec block_agent_run` on the parent orchestration run.
