---
name: fulcrum-team-status
description: Check status of running team instance.
---
# Team Status

Check on running team:

1. `fulcrum action exec list_team_instances` with `workspace_id` (+ optional `project_id`) → active teams.
2. Specific team: note `instance_id`, inspect `slots` for member run statuses.
3. Each slot's `run_id`: `fulcrum action exec get_agent_run_status` → heartbeat age + current step.
4. Any slot blocked or stale (heartbeat >30 min) → escalate via `fulcrum action exec block_agent_run` on parent orchestration run.
