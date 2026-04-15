---
name: daily-standup
description: Generate a concise status summary of workspace activity for standup
triggers:
  - daily check-in
  - status report requested
  - beginning of work session review
version: 1.0.0
author: fulcrum
---

# Daily Standup

To generate a standup summary:

1. Call `mcp__fulcrum__get_workspace_status` with `workspace_id` to get: active runs, WIP headroom, task counts.
2. Call `mcp__fulcrum__list_tasks` with `status: "in_progress"` to list active work.
3. For each active run, call `mcp__fulcrum__get_agent_run_status` to check heartbeat age and current step.
4. Format output as:
   - **Done yesterday**: completed tasks from the past 24 hours
   - **Doing today**: in-progress tasks with current status
   - **Blocked**: any runs with `status: "blocked"` and their blockers
5. Flag stale runs (last heartbeat > 30 min) as needing attention.
