---
name: workspace-status-on-session-start
description: Fetch workspace status at the start of every session to see running agents, WIP budget, and blocked runs. Applies before you start any new run or respond to a user request in a Fulcrum workspace.
allowed-tools:
  - mcp__fulcrum__get_current_context
  - mcp__fulcrum__get_workspace_status
user-invocable: false
---

# Check workspace status on session start

At the very start of a session, before you call `start_agent_run`, call
`mcp__fulcrum__get_workspace_status`. This is the cheapest way to avoid
duplicate work, WIP-limit surprises, and stale context.

## When to apply

- First MCP call of any new session in a Fulcrum workspace
- You woke up after a long pause (> 10 minutes) and the world may have
  moved on
- You're about to spawn or invoke another agent and need to know how much
  WIP budget is available
- You suspect another agent may be working on the same task

## How

```
# Step 1: get workspace_id (no parameters needed)
mcp__fulcrum__get_current_context

# Step 2: use the returned workspace_id
mcp__fulcrum__get_workspace_status
  workspace_id: <from get_current_context result>
```

The response tells you:

- **Active runs**: who else is running, in which role, on which task.
  If someone is already on your task, coordinate or pick a different task.
- **WIP by role**: current count vs limit. If your role is at limit,
  `start_agent_run` will be denied — pick a different role or block with
  reason "role at WIP limit".
- **Blocked runs**: anything stuck. If a blocked run is on a dependency
  you need, read its `reason` and consider resolving it first.
- **Stale runs**: runs the janitor has marked as stale (> 10 minutes
  silent). They are about to be freed from WIP; note the tasks they
  touched.

## Chief of staff extension

For `chief_of_staff` specifically, also call
`mcp__fulcrum__build_cos_context`. It returns a curated markdown block
(active runs, recent completions, pending blocks, WIP pressure) ready to
prepend to your next response. Always call it at session start and before
major planning turns — it is cheaper than re-deriving the state yourself.

## Red flags

- You called `start_agent_run` without first calling `get_workspace_status`
  → you're flying blind; collect context first next time.
- You tried to start a role at the WIP ceiling → the call will be denied; check
  status first with `get_workspace_status`.
- You ignored a blocked run on the same task → it almost certainly explains
  the problem you're about to hit; read the reason.

See also: [start-every-task](../start-every-task/SKILL.md),
[block-when-stuck](../block-when-stuck/SKILL.md).
