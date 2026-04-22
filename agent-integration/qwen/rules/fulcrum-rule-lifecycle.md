---
name: lifecycle
description: Register every session as Fulcrum agent run. Start, heartbeat, complete or block.
---

# Lifecycle

Session start, before first task:

1. `fulcrum action exec get_current_context` — returns `workspace_id`, `project_id`.
2. `fulcrum action exec get_workspace_status` — running work, blockers, queue.
3. `fulcrum action exec start_agent_run` — pass `agent_role`, `context_type`, and task. Save `run_id`.

Long ops (>5 min):

4. `fulcrum action exec heartbeat_agent_run` every 3–5 min. No heartbeat 10 min = stale.

Task end, exactly one:

5. `fulcrum action exec complete_agent_run` — summary + artifact paths.
6. `fulcrum action exec block_agent_run` — reason if stuck on human/external.

Silent end without complete/block = run stays `running`; janitor marks stale.
