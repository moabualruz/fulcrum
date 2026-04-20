---
name: lifecycle
description: Register every working session as a Fulcrum agent run. Start, heartbeat during long operations, complete or block at the end.
---

# Lifecycle

At the start of every session, before the first task:

1. `fulcrum action exec get_current_context` — returns `workspace_id` and
   `project_id`.
2. `fulcrum action exec get_workspace_status` — see running work, blockers,
   queue.
3. `fulcrum action exec start_agent_run` — pass your role and the task this
   session addresses. Save the returned `run_id`.

During any operation expected to take more than five minutes:

4. `fulcrum action exec heartbeat_agent_run` with `run_id` every three to
   five minutes. A run with no heartbeat for ten minutes is marked stale.

At end of task, exactly one of:

5. `fulcrum action exec complete_agent_run` with a summary and artifact
   paths changed.
6. `fulcrum action exec block_agent_run` with a reason, if you cannot
   proceed without human input or an external unblock.

A run that silently ends without `complete` or `block` leaves the task in
`running` state and the janitor marks it stale.
