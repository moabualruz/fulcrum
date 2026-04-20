---
name: fulcrum-daily-standup
description: Generate a concise status summary of workspace activity for standup
---
# Daily Standup

To generate a standup summary:

1. Call `fulcrum action exec get_workspace_status` with `workspace_id` to get: active runs, WIP headroom, task counts.
2. Call `fulcrum action exec list_tasks` with `status: "in_progress"` to list active work.
3. For each active run, call `fulcrum action exec get_agent_run_status` to check heartbeat age and current step.
4. Format output as:
   - **Done yesterday**: completed tasks from the past 24 hours
   - **Doing today**: in-progress tasks with current status
   - **Blocked**: any runs with `status: "blocked"` and their blockers
5. Flag stale runs (last heartbeat > 30 min) as needing attention.
