---
trigger: model_decision
description: "Fetch workspace status at session start — running agents, WIP budget, blocked runs. Before starting new run or responding to user request."
---


# Check workspace status on session start

Session start, before `start_agent_run`, call `fulcrum action exec get_workspace_status`. Cheapest way to avoid duplicate work, WIP surprises, stale context.

## When

- First MCP call of new session in Fulcrum workspace.
- Woke up after long pause (>10 min) — world may have moved.
- About to spawn/invoke another agent — need WIP budget.
- Suspect another agent on same task.

## How

```bash
# Step 1: workspace_id (no params)
fulcrum action exec get_current_context

# Step 2: use returned workspace_id
fulcrum action exec get_workspace_status --json '{"workspace_id":"ws_123"}'
```

Response:

- **Active runs**: who, which role, which task. Someone on your task → coordinate or pick different task.
- **WIP by role**: count vs limit. At limit → `start_agent_run` denied. Pick different role or block with reason "role at WIP limit".
- **Blocked runs**: anything stuck. Block on your dependency → read `reason`, consider resolving first.
- **Stale runs**: janitor-marked (>10 min silent). About to free WIP. Note touched tasks.

## CoS extension

As `chief_of_staff`, also call `fulcrum action exec build_cos_context`. Returns curated markdown block (active runs, recent completions, pending blocks, WIP pressure) ready to prepend to next response. Call at session start + before major planning turns. Cheaper than re-deriving state.

## Red flags

- `start_agent_run` without prior `get_workspace_status` → flying blind. Collect context first next time.
- Started role at WIP ceiling → denied. Check status first.
- Ignored blocked run on same task → almost certainly explains the problem you'll hit. Read reason.

See also: [start-every-task](../start-every-task/SKILL.md), [block-when-stuck](../block-when-stuck/SKILL.md).
