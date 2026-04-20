---
trigger: model_decision
description: "Concise status summary of workspace activity for standup."
---


# Daily Standup

Generate standup summary:

1. `fulcrum action exec get_workspace_status` with `workspace_id` → active runs, WIP headroom, task counts.
2. `fulcrum action exec list_tasks` with `status: "in_progress"` → active work.
3. Each active run: `fulcrum action exec get_agent_run_status` → heartbeat age + current step.
4. Format:
   - **Done yesterday**: completed tasks past 24h.
   - **Doing today**: in-progress + current status.
   - **Blocked**: runs with `status: "blocked"` + blockers.
5. Flag stale runs (last heartbeat >30 min) as needing attention.
